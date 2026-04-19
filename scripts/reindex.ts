#!/usr/bin/env -S pnpm tsx
/**
 * Admin CLI for reindexing from user PDSs. Three modes:
 *
 *   targeted  — `pnpm reindex <did-or-handle>...` or `--file <path>`.
 *               Runs locally, synchronous, prints a per-repo summary.
 *
 *   discover  — `pnpm reindex --discover`. Crawls a relay's listRepos
 *               and reindexes every repo that holds a branchline record.
 *               Local-only; for the durable / resumable version, enqueue
 *               a job instead.
 *
 *   queued    — `pnpm reindex --discover --queue`. Inserts a ReindexJob
 *               row and exits. The indexer Fly machine's reindex worker
 *               picks it up, executes it, and writes progress counters
 *               back to the row.
 *
 * Reads are unauthenticated — `com.atproto.repo.listRecords` is public —
 * so there's no login flow, unlike grant-seeds.
 *
 * Reindex is create-only: missing seeds/buds/pollen are inserted,
 * existing rows are left alone. Safe to re-run.
 */

import { readFileSync } from "node:fs";
import { prisma } from "../src/db.ts";
import type { ProcessDeps } from "../src/server/indexer/process.ts";
import {
	reindexRepo,
	resolveDidToPds,
	runDiscover,
} from "../src/server/reindex/discover.ts";

const FALLBACK_RESOLVER = "https://public.api.bsky.app";

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

// DIDs pass through untouched; anything else is treated as a handle and
// resolved via the Bluesky AppView. Matches the behavior users expect from
// the other admin CLIs.
async function resolveTarget(input: string): Promise<string> {
	if (input.startsWith("did:")) return input;
	return resolveHandleToDid(input);
}

async function reindexTarget(
	target: string,
	deps: ProcessDeps,
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
	const tally = await reindexRepo(did, pds, deps);
	console.log(
		`  total: ${tally.ok} indexed, ${tally.dropped} dropped, ${tally.errors} errors`,
	);
}

async function runLocalDiscover(
	deps: ProcessDeps,
	opts: { relay: string; concurrency: number; limit: number | null },
): Promise<void> {
	console.log(`discovering repos from ${opts.relay}`);
	console.log(
		`  concurrency=${opts.concurrency}${opts.limit ? ` limit=${opts.limit}` : ""}`,
	);

	// Shared stats ref — runDiscover mutates it on every repo. We peek at it
	// from onPageComplete for the periodic progress line.
	const stats = {
		scanned: 0,
		reindexed: 0,
		skipped: 0,
		errored: 0,
		lastDid: null as string | null,
	};

	const result = await runDiscover({
		relay: opts.relay,
		concurrency: opts.concurrency,
		limit: opts.limit,
		deps,
		stats,
		onRepoResult: (did, outcome) => {
			if (outcome.kind === "skipped") return;
			if (outcome.kind === "reindexed") {
				console.log(
					`  index  ${did}  (${outcome.tally.ok} ok, ${outcome.tally.dropped} dropped, ${outcome.tally.errors} err)`,
				);
			} else {
				console.error(`  error  ${did}: ${outcome.error}`);
			}
		},
		onPageComplete: () => {
			console.log(
				`  ... scanned=${stats.scanned} reindexed=${stats.reindexed} skipped=${stats.skipped} errored=${stats.errored}`,
			);
		},
	});
	console.log(
		`done: scanned=${result.stats.scanned} reindexed=${result.stats.reindexed} skipped=${result.stats.skipped} errored=${result.stats.errored}`,
	);
}

async function queueDiscoverJob(opts: {
	relay: string;
	concurrency: number;
	limit: number | null;
}): Promise<void> {
	const job = await prisma.reindexJob.create({
		data: {
			kind: "discover",
			status: "pending",
			relay: opts.relay,
			concurrency: opts.concurrency,
			recordLimit: opts.limit,
		},
	});
	console.log(`queued discover job ${job.id}`);
	console.log(
		`  relay=${job.relay} concurrency=${job.concurrency}${job.recordLimit ? ` limit=${job.recordLimit}` : ""}`,
	);
	console.log(
		`  watch:   SELECT status, scanned, reindexed, skipped, errored, "lastDid", "heartbeatAt" FROM "ReindexJob" WHERE id='${job.id}';`,
	);
	console.log(
		`  cancel:  UPDATE "ReindexJob" SET "cancelRequested"=true WHERE id='${job.id}';`,
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

type DiscoverCliOptions = {
	relay: string;
	concurrency: number;
	limit: number | null;
};

type CliArgs =
	| { mode: "targets"; targets: string[] }
	| { mode: "discover"; queue: boolean; options: DiscoverCliOptions };

function parsePositiveInt(flag: string, raw: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) {
		throw new Error(`${flag} must be a positive integer, got: ${raw}`);
	}
	return n;
}

function parseArgs(argv: string[]): CliArgs {
	const targets: string[] = [];
	let file: string | undefined;
	let discover = false;
	let queue = false;
	let relay = DEFAULT_RELAY;
	let concurrency = DEFAULT_DISCOVER_CONCURRENCY;
	let limit: number | null = null;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--file" || a === "-f") {
			file = argv[++i];
		} else if (a.startsWith("--file=")) {
			file = a.slice("--file=".length);
		} else if (a === "--discover") {
			discover = true;
		} else if (a === "--queue") {
			queue = true;
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
			queue,
			options: { relay, concurrency, limit },
		};
	}
	if (queue) {
		throw new Error("--queue is only valid together with --discover");
	}

	if (file) {
		if (targets.length > 0) {
			throw new Error("pass either --file or targets, not both");
		}
		return { mode: "targets", targets: parseTargetsFromFile(file) };
	}

	return { mode: "targets", targets };
}

function usage(): void {
	console.log(`branchline reindex

  pnpm reindex <did-or-handle>...         reindex the listed repos (local)
  pnpm reindex --file <path>              one DID or handle per line (# comments ok)
  pnpm reindex --discover                 crawl a relay, reindex every branchline
                                          repo (local — long-running, blocks terminal)
  pnpm reindex --discover --queue         same as above but enqueued as a ReindexJob
                                          for the Fly indexer worker to execute

Flags:
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
			if (parsed.queue) {
				await queueDiscoverJob(parsed.options);
			} else {
				await runLocalDiscover(deps, parsed.options);
			}
			return;
		}

		if (parsed.targets.length === 0) {
			usage();
			process.exit(2);
		}

		for (const target of parsed.targets) {
			await reindexTarget(target, deps);
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
