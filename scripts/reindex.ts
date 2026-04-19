#!/usr/bin/env -S pnpm tsx
/**
 * Admin CLI for reindexing a repo by walking the author's PDS and feeding
 * every bud / seed / pollen record through the same processors the Jetstream
 * indexer uses. Intended for catching up accounts we missed — new users,
 * Jetstream outages, a forgotten DID — not for resyncing updates: the process
 * functions upsert with `update: {}`, so existing rows are left untouched.
 *
 * Reads are unauthenticated — `com.atproto.repo.listRecords` is public — so
 * no login flow, unlike grant-seeds.
 *
 * Usage:
 *   pnpm reindex <did-or-handle>...
 *   pnpm reindex --file <path.txt>   # one DID or handle per line, # comments ok
 */

import { readFileSync } from "node:fs";
import { AtpAgent } from "@atproto/api";
import { prisma } from "../src/db.ts";
import { ensureHandleCached } from "../src/server/identity/resolve.ts";
import {
	BUD_COLLECTION,
	POLLEN_COLLECTION,
	SEED_COLLECTION,
} from "../src/server/indexer/jetstream.ts";
import {
	type JetstreamCommitCreate,
	type ProcessDeps,
	type ProcessResult,
	processBudCreate,
	processPollenCreate,
	processSeedCreate,
} from "../src/server/indexer/process.ts";

const PLC_DIRECTORY_URL =
	process.env.PLC_DIRECTORY_URL ?? "https://plc.directory";
const FALLBACK_RESOLVER = "https://public.api.bsky.app";
const LIST_PAGE_SIZE = 100;

type DidDocument = {
	service?: Array<{ id?: unknown; type?: unknown; serviceEndpoint?: unknown }>;
};

async function resolveHandleToDid(handle: string): Promise<string> {
	const url = new URL(
		"/xrpc/com.atproto.identity.resolveHandle",
		FALLBACK_RESOLVER,
	);
	url.searchParams.set("handle", handle);
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) {
		throw new Error(`resolveHandle ${handle}: HTTP ${res.status}`);
	}
	const body = (await res.json()) as { did?: unknown };
	if (typeof body.did !== "string") {
		throw new Error(`resolveHandle ${handle}: malformed response`);
	}
	return body.did;
}

async function resolveDidToPds(did: string): Promise<string> {
	let url: string;
	if (did.startsWith("did:plc:")) {
		url = `${PLC_DIRECTORY_URL}/${did}`;
	} else if (did.startsWith("did:web:")) {
		const host = decodeURIComponent(did.slice("did:web:".length).split(":")[0]);
		url = `https://${host}/.well-known/did.json`;
	} else {
		throw new Error(`unsupported DID method: ${did}`);
	}
	const res = await fetch(url, {
		headers: { accept: "application/did+json, application/json" },
	});
	if (!res.ok) throw new Error(`DID doc ${did}: HTTP ${res.status}`);
	const doc = (await res.json()) as DidDocument;
	for (const svc of doc.service ?? []) {
		const id = typeof svc.id === "string" ? svc.id : "";
		if (
			id.endsWith("#atproto_pds") &&
			typeof svc.serviceEndpoint === "string"
		) {
			return svc.serviceEndpoint;
		}
	}
	throw new Error(`DID doc ${did}: no atproto_pds service endpoint`);
}

// DIDs pass through untouched; anything else is treated as a handle and
// resolved via the Bluesky AppView. Matches the behavior users expect from
// the other admin CLIs.
async function resolveTarget(input: string): Promise<string> {
	if (input.startsWith("did:")) return input;
	return resolveHandleToDid(input);
}

type ListedRecord = {
	uri: string;
	cid: string;
	value: Record<string, unknown>;
};

async function* listAllRecords(
	agent: AtpAgent,
	did: string,
	collection: string,
): AsyncGenerator<ListedRecord> {
	let cursor: string | undefined;
	do {
		const res = await agent.com.atproto.repo.listRecords({
			repo: did,
			collection,
			limit: LIST_PAGE_SIZE,
			cursor,
		});
		for (const r of res.data.records) {
			yield {
				uri: r.uri,
				cid: r.cid,
				value: r.value as Record<string, unknown>,
			};
		}
		cursor = res.data.cursor;
	} while (cursor);
}

function rkeyFromUri(uri: string): string {
	const last = uri.split("/").pop();
	if (!last) throw new Error(`malformed AT-URI: ${uri}`);
	return last;
}

// A bud's parent can be another bud in the same repo, so records must hit the
// processor in the order their rkeys were minted. listRecords returns newest
// first by default, and sorting by the record's own createdAt is both cheaper
// and more forgiving of clock-skew than fetching `rev` per record.
function sortByCreatedAt(records: ListedRecord[]): ListedRecord[] {
	return [...records].sort((a, b) => {
		const ac = typeof a.value.createdAt === "string" ? a.value.createdAt : "";
		const bc = typeof b.value.createdAt === "string" ? b.value.createdAt : "";
		return ac.localeCompare(bc);
	});
}

type Tally = { ok: number; dropped: number; errors: number };

function newTally(): Tally {
	return { ok: 0, dropped: 0, errors: 0 };
}

async function processOne(
	did: string,
	collection: string,
	record: ListedRecord,
	deps: ProcessDeps,
	verbose: boolean,
): Promise<ProcessResult | null> {
	const event: JetstreamCommitCreate = {
		did,
		// Time_us feeds the jetstream cursor, which this path doesn't touch.
		// Use now-in-microseconds purely so downstream logs are ordered.
		time_us: Date.now() * 1000,
		kind: "commit",
		commit: {
			rev: "",
			operation: "create",
			collection,
			rkey: rkeyFromUri(record.uri),
			record: record.value as JetstreamCommitCreate["commit"]["record"],
			cid: record.cid,
		},
	};

	let result: ProcessResult;
	switch (collection) {
		case SEED_COLLECTION:
			result = await processSeedCreate(event, deps);
			break;
		case BUD_COLLECTION:
			result = await processBudCreate(event, deps);
			break;
		case POLLEN_COLLECTION:
			result = await processPollenCreate(event, deps);
			break;
		default:
			return null;
	}

	if (verbose) {
		const tag = `${collection.split(".").pop()} ${record.uri}`;
		if (result.ok) {
			console.log(`  ok       ${tag}`);
		} else {
			console.log(`  dropped  ${tag}: ${result.reason}`);
		}
	}
	return result;
}

async function reindexCollection(
	agent: AtpAgent,
	did: string,
	collection: string,
	deps: ProcessDeps,
	verbose: boolean,
): Promise<Tally> {
	const tally = newTally();
	const buffer: ListedRecord[] = [];
	try {
		for await (const r of listAllRecords(agent, did, collection)) {
			buffer.push(r);
		}
	} catch (err) {
		console.error(
			`  listRecords ${collection} failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		tally.errors++;
		return tally;
	}

	for (const record of sortByCreatedAt(buffer)) {
		try {
			const result = await processOne(did, collection, record, deps, verbose);
			if (!result) continue;
			if (result.accepted) tally.ok++;
			else tally.dropped++;
		} catch (err) {
			tally.errors++;
			console.error(
				`  ${collection.split(".").pop()} ${record.uri} threw: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
	return tally;
}

async function reindexDid(
	target: string,
	deps: ProcessDeps,
	verbose: boolean,
): Promise<void> {
	let did: string;
	try {
		did = await resolveTarget(target);
	} catch (err) {
		console.error(
			`skip ${target}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return;
	}

	let pds: string;
	try {
		pds = await resolveDidToPds(did);
	} catch (err) {
		console.error(
			`skip ${target} (${did}): ${err instanceof Error ? err.message : String(err)}`,
		);
		return;
	}

	console.log(`reindexing ${did}`);
	console.log(`  pds: ${pds}`);
	const agent = new AtpAgent({ service: pds });

	// Warm the handle cache so the UI renders the author's handle without
	// waiting for a future bud commit to trigger `ensureHandleCached`.
	ensureHandleCached(did).catch((err) => {
		console.error(
			`  handle cache warm failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	});

	// Seeds before buds (buds reference seeds as the plant root); buds before
	// pollen (pollen references bud subjects). Matches the FK topology — a
	// record whose dependency isn't in the DB yet is dropped as
	// `parent-not-found` / `subject-not-found` and has to wait for another
	// pass or the missing author's own reindex run.
	const collections = [SEED_COLLECTION, BUD_COLLECTION, POLLEN_COLLECTION];
	for (const collection of collections) {
		const short = collection.split(".").pop();
		const tally = await reindexCollection(agent, did, collection, deps, verbose);
		console.log(
			`  ${short}: ${tally.ok} indexed, ${tally.dropped} dropped, ${tally.errors} errors`,
		);
	}
}

function parseTargetsFromFile(path: string): string[] {
	const text = readFileSync(path, "utf8");
	return text
		.split(/\r?\n/)
		.map((l) => l.replace(/#.*$/, "").trim())
		.filter((l) => l.length > 0);
}

type CliArgs = { targets: string[]; verbose: boolean };

function parseArgs(argv: string[]): CliArgs {
	const targets: string[] = [];
	let verbose = false;
	let file: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--file" || a === "-f") {
			file = argv[++i];
		} else if (a.startsWith("--file=")) {
			file = a.slice("--file=".length);
		} else if (a === "--verbose" || a === "-v") {
			verbose = true;
		} else if (a === "--help" || a === "-h") {
			usage();
			process.exit(0);
		} else if (a.startsWith("-")) {
			throw new Error(`unknown flag: ${a}`);
		} else {
			targets.push(a);
		}
	}

	if (file) {
		if (targets.length > 0) {
			throw new Error("pass either --file or targets, not both");
		}
		return { targets: parseTargetsFromFile(file), verbose };
	}

	return { targets, verbose };
}

function usage(): void {
	console.log(`branchline reindex

  pnpm reindex <did-or-handle>...        reindex the listed repos
  pnpm reindex --file <path>             one DID or handle per line (# comments ok)

Flags:
  --verbose, -v  log every record, not just per-collection totals

Reindex is create-only: missing seeds/buds/pollen are inserted, existing rows
are left alone. Safe to re-run. Records whose parents haven't been indexed yet
are dropped with a reason — run the parent author's reindex first, or re-run.`);
}

async function main(): Promise<void> {
	const { targets, verbose } = parseArgs(process.argv.slice(2));
	if (targets.length === 0) {
		usage();
		process.exit(2);
	}

	const deps: ProcessDeps = { prisma, now: () => new Date() };

	try {
		for (const target of targets) {
			await reindexDid(target, deps, verbose);
		}
	} finally {
		await prisma.$disconnect();
	}
}

try {
	await main();
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
}
