import { AtpAgent } from "@atproto/api";
import { ensureHandleCached } from "../identity/resolve.ts";
import {
	BUD_COLLECTION,
	POLLEN_COLLECTION,
	SEED_COLLECTION,
} from "../indexer/jetstream.ts";
import {
	type JetstreamCommitCreate,
	type ProcessDeps,
	type ProcessResult,
	processBudCreate,
	processPollenCreate,
	processSeedCreate,
} from "../indexer/process.ts";

const PLC_DIRECTORY_URL =
	process.env.PLC_DIRECTORY_URL ?? "https://plc.directory";
const LIST_PAGE_SIZE = 100;
const LIST_REPOS_PAGE_SIZE = 1000;

// Seeds before buds (buds reference seeds as the plant root); buds before
// pollen (pollen references bud subjects). Matches the FK topology — a
// record whose dependency isn't in the DB yet is dropped as
// `parent-not-found` / `subject-not-found` and has to wait for another
// pass or the missing author's own reindex run.
export const BRANCHLINE_COLLECTIONS = [
	SEED_COLLECTION,
	BUD_COLLECTION,
	POLLEN_COLLECTION,
] as const;

type DidDocument = {
	service?: Array<{ id?: unknown; type?: unknown; serviceEndpoint?: unknown }>;
};

export async function resolveDidToPds(did: string): Promise<string> {
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

async function processOne(
	did: string,
	collection: string,
	record: ListedRecord,
	deps: ProcessDeps,
): Promise<ProcessResult | null> {
	const event: JetstreamCommitCreate = {
		did,
		// time_us feeds the jetstream cursor, which this path doesn't touch.
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

	switch (collection) {
		case SEED_COLLECTION:
			return processSeedCreate(event, deps);
		case BUD_COLLECTION:
			return processBudCreate(event, deps);
		case POLLEN_COLLECTION:
			return processPollenCreate(event, deps);
		default:
			return null;
	}
}

export type RepoTally = { ok: number; dropped: number; errors: number };

async function reindexCollection(
	agent: AtpAgent,
	did: string,
	collection: string,
	deps: ProcessDeps,
): Promise<RepoTally> {
	// listRecords failures bubble up so the caller can mark the whole repo
	// errored — a broken PDS shouldn't be silently counted as a partial
	// success. Per-record processing errors are tallied so one bad record
	// doesn't abort the collection.
	const tally: RepoTally = { ok: 0, dropped: 0, errors: 0 };
	const buffer: ListedRecord[] = [];
	for await (const r of listAllRecords(agent, did, collection)) {
		buffer.push(r);
	}

	for (const record of sortByCreatedAt(buffer)) {
		try {
			const result = await processOne(did, collection, record, deps);
			if (!result) continue;
			if (result.accepted) tally.ok++;
			else tally.dropped++;
		} catch {
			tally.errors++;
		}
	}
	return tally;
}

export async function reindexRepo(
	did: string,
	pds: string,
	deps: ProcessDeps,
): Promise<RepoTally> {
	const agent = new AtpAgent({ service: pds });

	// Warm the handle cache so the UI renders the author's handle without
	// waiting for a future bud commit to trigger `ensureHandleCached`.
	ensureHandleCached(did).catch(() => {});

	const total: RepoTally = { ok: 0, dropped: 0, errors: 0 };
	for (const collection of BRANCHLINE_COLLECTIONS) {
		const tally = await reindexCollection(agent, did, collection, deps);
		total.ok += tally.ok;
		total.dropped += tally.dropped;
		total.errors += tally.errors;
	}
	return total;
}

// Cheap collections check: one `describeRepo` call tells us which NSIDs the
// repo holds, so we can short-circuit repos that have never touched any
// branchline lexicon before paying for three listRecords round-trips.
export async function repoHasBranchlineCollection(
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

type ListReposPage = {
	repos: Array<{ did: string }>;
	cursor: string | undefined;
};

async function fetchListReposPage(
	relay: string,
	cursor: string | undefined,
): Promise<ListReposPage> {
	const agent = new AtpAgent({ service: relay });
	const res = await agent.com.atproto.sync.listRepos({
		limit: LIST_REPOS_PAGE_SIZE,
		cursor,
	});
	return {
		repos: res.data.repos.map((r) => ({ did: r.did })),
		cursor: res.data.cursor,
	};
}

export type DiscoverStats = {
	scanned: number;
	reindexed: number;
	skipped: number;
	errored: number;
	lastDid: string | null;
};

export type DiscoverOptions = {
	relay: string;
	concurrency: number;
	limit: number | null;
	initialCursor?: string;
	// Live stats object — runDiscover mutates this in place, so callers that
	// need mid-run progress (e.g. the DB worker's heartbeat timer) can read
	// counters at any tick without an extra callback round-trip.
	stats?: DiscoverStats;
	deps: ProcessDeps;
	onRepoResult?: (did: string, outcome: RepoOutcome) => void;
	// Called after each listRepos page completes, with the cursor to resume
	// from. Worker persists the cursor so a crashed job can restart mid-crawl.
	onPageComplete?: (cursor: string | undefined) => void | Promise<void>;
	// Polled at each page boundary. When it returns true, runDiscover returns
	// `cancelled: true` without advancing the cursor further.
	shouldCancel?: () => boolean | Promise<boolean>;
};

export type RepoOutcome =
	| { kind: "skipped" }
	| { kind: "reindexed"; tally: RepoTally }
	| { kind: "errored"; error: string };

export type DiscoverResult = {
	stats: DiscoverStats;
	cursor: string | undefined;
	cancelled: boolean;
};

function emptyStats(): DiscoverStats {
	return { scanned: 0, reindexed: 0, skipped: 0, errored: 0, lastDid: null };
}

async function processRepo(
	did: string,
	deps: ProcessDeps,
): Promise<RepoOutcome> {
	const pds = await resolveDidToPds(did);
	const has = await repoHasBranchlineCollection(pds, did);
	if (!has) return { kind: "skipped" };
	const tally = await reindexRepo(did, pds, deps);
	return { kind: "reindexed", tally };
}

async function runPage(
	dids: string[],
	concurrency: number,
	deps: ProcessDeps,
	stats: DiscoverStats,
	limit: number | null,
	onRepoResult: DiscoverOptions["onRepoResult"],
): Promise<void> {
	// Share a single iterator across N workers so each `.next()` pulls a
	// distinct DID. AsyncGenerators serialize .next() internally — no lock
	// needed.
	let idx = 0;
	const take = (): string | undefined => {
		if (limit !== null && stats.scanned >= limit) return undefined;
		if (idx >= dids.length) return undefined;
		return dids[idx++];
	};

	async function worker(): Promise<void> {
		while (true) {
			const did = take();
			if (did === undefined) return;
			stats.scanned++;
			stats.lastDid = did;
			let outcome: RepoOutcome;
			try {
				outcome = await processRepo(did, deps);
			} catch (err) {
				outcome = {
					kind: "errored",
					error: err instanceof Error ? err.message : String(err),
				};
			}
			if (outcome.kind === "skipped") stats.skipped++;
			else if (outcome.kind === "reindexed") stats.reindexed++;
			else stats.errored++;
			onRepoResult?.(did, outcome);
		}
	}

	await Promise.all(
		Array.from({ length: Math.max(1, concurrency) }, () => worker()),
	);
}

// Paginate `com.atproto.sync.listRepos` on the relay and funnel each page
// through `processRepo` with worker-pool concurrency. After each page we
// invoke `onPageComplete` with the new cursor + cumulative stats so the
// caller (the DB-backed worker) can persist a restart-safe checkpoint.
export async function runDiscover(
	opts: DiscoverOptions,
): Promise<DiscoverResult> {
	const stats = opts.stats ?? emptyStats();
	let cursor = opts.initialCursor;

	while (true) {
		if (opts.shouldCancel && (await opts.shouldCancel())) {
			return { stats, cursor, cancelled: true };
		}
		if (opts.limit !== null && stats.scanned >= opts.limit) {
			return { stats, cursor, cancelled: false };
		}

		const page = await fetchListReposPage(opts.relay, cursor);
		if (page.repos.length === 0) {
			return { stats, cursor: page.cursor, cancelled: false };
		}

		await runPage(
			page.repos.map((r) => r.did),
			opts.concurrency,
			opts.deps,
			stats,
			opts.limit,
			opts.onRepoResult,
		);

		cursor = page.cursor;
		if (opts.onPageComplete) await opts.onPageComplete(cursor);

		if (!cursor) {
			return { stats, cursor: undefined, cancelled: false };
		}
	}
}
