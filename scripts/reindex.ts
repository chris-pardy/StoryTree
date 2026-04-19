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
 *   pnpm reindex --discover          # crawl a relay's listRepos and reindex
 *                                    # every repo that has a branchline record
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

// Seeds before buds (buds reference seeds as the plant root); buds before
// pollen (pollen references bud subjects). Matches the FK topology — a
// record whose dependency isn't in the DB yet is dropped as
// `parent-not-found` / `subject-not-found` and has to wait for another
// pass or the missing author's own reindex run.
const BRANCHLINE_COLLECTIONS = [
	SEED_COLLECTION,
	BUD_COLLECTION,
	POLLEN_COLLECTION,
] as const;

type RepoTally = { ok: number; dropped: number; errors: number };

async function reindexRepo(
	did: string,
	pds: string,
	deps: ProcessDeps,
	verbose: boolean,
	logPrefix: string,
): Promise<RepoTally> {
	const agent = new AtpAgent({ service: pds });

	// Warm the handle cache so the UI renders the author's handle without
	// waiting for a future bud commit to trigger `ensureHandleCached`.
	ensureHandleCached(did).catch((err) => {
		console.error(
			`${logPrefix}handle cache warm failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	});

	const total: RepoTally = { ok: 0, dropped: 0, errors: 0 };
	for (const collection of BRANCHLINE_COLLECTIONS) {
		const short = collection.split(".").pop();
		const tally = await reindexCollection(agent, did, collection, deps, verbose);
		total.ok += tally.ok;
		total.dropped += tally.dropped;
		total.errors += tally.errors;
		if (verbose) {
			console.log(
				`${logPrefix}${short}: ${tally.ok} indexed, ${tally.dropped} dropped, ${tally.errors} errors`,
			);
		}
	}
	return total;
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
	const tally = await reindexRepo(did, pds, deps, verbose, "  ");
	console.log(
		`  total: ${tally.ok} indexed, ${tally.dropped} dropped, ${tally.errors} errors`,
	);
}

// Iterate every DID hosted by a relay via `com.atproto.sync.listRepos`.
// Pagination uses the server-provided cursor; we stop when the cursor
// disappears or the response contains no repos (both signal end-of-list).
async function* paginateRelayRepos(
	relay: string,
): AsyncGenerator<{ did: string }> {
	const agent = new AtpAgent({ service: relay });
	let cursor: string | undefined;
	do {
		const res = await agent.com.atproto.sync.listRepos({
			limit: 1000,
			cursor,
		});
		for (const r of res.data.repos) {
			yield { did: r.did };
		}
		if (res.data.repos.length === 0) return;
		cursor = res.data.cursor;
	} while (cursor);
}

// Cheap collections check: one `describeRepo` call tells us which NSIDs the
// repo holds, so we can short-circuit repos that have never touched any
// branchline lexicon before paying for three listRecords round-trips.
async function repoHasBranchlineCollection(
	pds: string,
	did: string,
): Promise<boolean> {
	const agent = new AtpAgent({ service: pds });
	const res = await agent.com.atproto.repo.describeRepo({ repo: did });
	const collections = res.data.collections;
	if (!Array.isArray(collections)) return false;
	return collections.some((c) =>
		(BRANCHLINE_COLLECTIONS as readonly string[]).includes(c),
	);
}

type DiscoverOptions = {
	relay: string;
	concurrency: number;
	limit: number | null;
	verbose: boolean;
};

type DiscoverStats = {
	scanned: number;
	reindexed: number;
	skipped: number;
	errored: number;
};

async function runDiscover(
	deps: ProcessDeps,
	opts: DiscoverOptions,
): Promise<void> {
	console.log(`discovering repos from ${opts.relay}`);
	console.log(
		`  concurrency=${opts.concurrency}${opts.limit ? ` limit=${opts.limit}` : ""}`,
	);

	const stats: DiscoverStats = {
		scanned: 0,
		reindexed: 0,
		skipped: 0,
		errored: 0,
	};

	// Share a single async iterator across N workers. Each `.next()` on an
	// AsyncGenerator is queued by the runtime, so workers always pull distinct
	// DIDs — no external locking needed.
	const iter = paginateRelayRepos(opts.relay)[Symbol.asyncIterator]();
	let hitLimit = false;

	async function worker(): Promise<void> {
		while (!hitLimit) {
			const step = await iter.next();
			if (step.done) return;
			const { did } = step.value;
			stats.scanned++;
			const n = stats.scanned;
			if (opts.limit !== null && n > opts.limit) {
				hitLimit = true;
				return;
			}

			try {
				const pds = await resolveDidToPds(did);
				const has = await repoHasBranchlineCollection(pds, did);
				if (!has) {
					stats.skipped++;
					if (opts.verbose) {
						console.log(`[${n}] skip   ${did}`);
					}
					continue;
				}
				const tally = await reindexRepo(did, pds, deps, opts.verbose, "    ");
				stats.reindexed++;
				console.log(
					`[${n}] index  ${did}  (${tally.ok} ok, ${tally.dropped} dropped, ${tally.errors} err)`,
				);
			} catch (err) {
				stats.errored++;
				console.error(
					`[${n}] error  ${did}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}

			// Progress ping every 1000 DIDs so long sweeps show signs of life.
			if (n % 1000 === 0) {
				console.log(
					`  ... scanned=${stats.scanned} reindexed=${stats.reindexed} skipped=${stats.skipped} errored=${stats.errored}`,
				);
			}
		}
	}

	await Promise.all(
		Array.from({ length: opts.concurrency }, () => worker()),
	);

	console.log(
		`done: scanned=${stats.scanned} reindexed=${stats.reindexed} skipped=${stats.skipped} errored=${stats.errored}`,
	);
}

function parseTargetsFromFile(path: string): string[] {
	const text = readFileSync(path, "utf8");
	return text
		.split(/\r?\n/)
		.map((l) => l.replace(/#.*$/, "").trim())
		.filter((l) => l.length > 0);
}

const DEFAULT_RELAY = "https://bsky.network";
const DEFAULT_DISCOVER_CONCURRENCY = 8;

type CliArgs =
	| { mode: "targets"; targets: string[]; verbose: boolean }
	| { mode: "discover"; options: DiscoverOptions };

function parsePositiveInt(flag: string, raw: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) {
		throw new Error(`${flag} must be a positive integer, got: ${raw}`);
	}
	return n;
}

function parseArgs(argv: string[]): CliArgs {
	const targets: string[] = [];
	let verbose = false;
	let file: string | undefined;
	let discover = false;
	let relay = DEFAULT_RELAY;
	let concurrency = DEFAULT_DISCOVER_CONCURRENCY;
	let limit: number | null = null;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--file" || a === "-f") {
			file = argv[++i];
		} else if (a.startsWith("--file=")) {
			file = a.slice("--file=".length);
		} else if (a === "--verbose" || a === "-v") {
			verbose = true;
		} else if (a === "--discover") {
			discover = true;
		} else if (a === "--relay") {
			relay = argv[++i];
		} else if (a.startsWith("--relay=")) {
			relay = a.slice("--relay=".length);
		} else if (a === "--concurrency") {
			concurrency = parsePositiveInt("--concurrency", argv[++i]);
		} else if (a.startsWith("--concurrency=")) {
			concurrency = parsePositiveInt(
				"--concurrency",
				a.slice("--concurrency=".length),
			);
		} else if (a === "--limit") {
			limit = parsePositiveInt("--limit", argv[++i]);
		} else if (a.startsWith("--limit=")) {
			limit = parsePositiveInt("--limit", a.slice("--limit=".length));
		} else if (a === "--help" || a === "-h") {
			usage();
			process.exit(0);
		} else if (a.startsWith("-")) {
			throw new Error(`unknown flag: ${a}`);
		} else {
			targets.push(a);
		}
	}

	if (discover) {
		if (targets.length > 0 || file) {
			throw new Error("--discover can't be combined with targets or --file");
		}
		return {
			mode: "discover",
			options: { relay, concurrency, limit, verbose },
		};
	}

	if (file) {
		if (targets.length > 0) {
			throw new Error("pass either --file or targets, not both");
		}
		return {
			mode: "targets",
			targets: parseTargetsFromFile(file),
			verbose,
		};
	}

	return { mode: "targets", targets, verbose };
}

function usage(): void {
	console.log(`branchline reindex

  pnpm reindex <did-or-handle>...        reindex the listed repos
  pnpm reindex --file <path>             one DID or handle per line (# comments ok)
  pnpm reindex --discover                walk every repo a relay knows about and
                                         reindex the ones that hold branchline
                                         records (uses describeRepo as a filter)

Flags:
  --verbose, -v           log every record and every scanned repo
  --relay <url>           relay to crawl in discover mode (default ${DEFAULT_RELAY})
  --concurrency <n>       parallel repos during discover (default ${DEFAULT_DISCOVER_CONCURRENCY})
  --limit <n>             stop discover after scanning n repos (useful for testing)

Reindex is create-only: missing seeds/buds/pollen are inserted, existing rows
are left alone. Safe to re-run. Records whose parents haven't been indexed yet
are dropped with a reason — run the parent author's reindex first, or re-run.`);
}

async function main(): Promise<void> {
	const parsed = parseArgs(process.argv.slice(2));

	const deps: ProcessDeps = { prisma, now: () => new Date() };

	try {
		if (parsed.mode === "discover") {
			await runDiscover(deps, parsed.options);
			return;
		}

		if (parsed.targets.length === 0) {
			usage();
			process.exit(2);
		}

		for (const target of parsed.targets) {
			await reindexDid(target, deps, parsed.verbose);
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
