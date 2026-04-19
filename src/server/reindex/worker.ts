import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { ProcessDeps } from "../indexer/process.ts";
import {
	type DiscoverStats,
	runDiscover,
} from "./discover.ts";

// How often to look for a claimable job. Short enough that interactive users
// don't feel latency between enqueue and pickup, long enough that an empty
// queue doesn't hammer Postgres.
const POLL_INTERVAL_MS = 5_000;

// Progress counters are flushed at most this often while a job is running.
// Each flush is one UPDATE; 2s keeps the DB writeload sane while still
// giving the admin dashboard near-real-time numbers.
const PROGRESS_FLUSH_MS = 2_000;

// If a `running` row hasn't had its heartbeat touched in this long, another
// worker reclaims it and resumes from the saved cursor. Must be meaningfully
// larger than PROGRESS_FLUSH_MS to avoid false reclaims during normal work.
const STALE_HEARTBEAT_MS = 120_000;

const KIND_DISCOVER = "discover";

type JobRow = {
	id: string;
	kind: string;
	status: string;
	relay: string;
	concurrency: number;
	recordLimit: number | null;
	cursor: string | null;
	scanned: number;
	reindexed: number;
	skipped: number;
	errored: number;
	lastDid: string | null;
	cancelRequested: boolean;
};

type WorkerDeps = {
	prisma: PrismaClient;
	process: ProcessDeps;
	workerId: string;
};

// Atomically claim the oldest pending job by flipping its status to
// `running`. updateMany with a status guard is the Prisma idiom for
// compare-and-swap — two workers racing on the same row see count=1 and
// count=0 respectively. Returns the claimed row, or null if nothing pending.
async function claimPending(deps: WorkerDeps): Promise<JobRow | null> {
	const { prisma, workerId } = deps;
	const candidate = await prisma.reindexJob.findFirst({
		where: { status: "pending" },
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});
	if (!candidate) return null;

	const now = new Date();
	const res = await prisma.reindexJob.updateMany({
		where: { id: candidate.id, status: "pending" },
		data: {
			status: "running",
			workerId,
			startedAt: now,
			heartbeatAt: now,
		},
	});
	if (res.count === 0) return null;
	return (await prisma.reindexJob.findUnique({
		where: { id: candidate.id },
	})) as JobRow | null;
}

// Recover a `running` job whose worker died mid-execution. The reclaim is
// the same compare-and-swap pattern: only flip the row if heartbeatAt is
// still the stale value we observed, so we don't stomp a worker that just
// flushed progress.
async function reclaimStale(deps: WorkerDeps): Promise<JobRow | null> {
	const { prisma, workerId } = deps;
	const cutoff = new Date(Date.now() - STALE_HEARTBEAT_MS);
	const candidate = await prisma.reindexJob.findFirst({
		where: {
			status: "running",
			OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }],
		},
		orderBy: { createdAt: "asc" },
		select: { id: true, heartbeatAt: true },
	});
	if (!candidate) return null;

	const now = new Date();
	const res = await prisma.reindexJob.updateMany({
		where: {
			id: candidate.id,
			status: "running",
			heartbeatAt: candidate.heartbeatAt,
		},
		data: { workerId, heartbeatAt: now },
	});
	if (res.count === 0) return null;

	console.log(
		`[reindex] reclaimed stale job ${candidate.id} (worker ${workerId})`,
	);
	return (await prisma.reindexJob.findUnique({
		where: { id: candidate.id },
	})) as JobRow | null;
}

function statsFromJob(job: JobRow): DiscoverStats {
	return {
		scanned: job.scanned,
		reindexed: job.reindexed,
		skipped: job.skipped,
		errored: job.errored,
		lastDid: job.lastDid,
	};
}

async function executeDiscoverJob(
	job: JobRow,
	deps: WorkerDeps,
): Promise<void> {
	const { prisma } = deps;
	console.log(
		`[reindex] running ${job.id}: discover relay=${job.relay} concurrency=${job.concurrency}${job.recordLimit ? ` limit=${job.recordLimit}` : ""}${job.cursor ? ` resuming from cursor` : ""}`,
	);

	// Live state visible to the heartbeat timer below:
	//   - `stats` is mutated in place by runDiscover on every repo.
	//   - `cursor` is updated at each page boundary via onPageComplete.
	//   - `cachedCancel` is refreshed on every DB flush so shouldCancel is
	//     sync and doesn't add a DB round-trip per page.
	const stats: DiscoverStats = statsFromJob(job);
	let cursor: string | undefined = job.cursor ?? undefined;
	let cachedCancel = job.cancelRequested;
	let flushInFlight = false;

	const flush = async (): Promise<void> => {
		// Skip if a previous flush is still going — overlapping updates on the
		// same row just contend on locks without adding fresher data.
		if (flushInFlight) return;
		flushInFlight = true;
		try {
			const row = await prisma.reindexJob.update({
				where: { id: job.id },
				data: {
					scanned: stats.scanned,
					reindexed: stats.reindexed,
					skipped: stats.skipped,
					errored: stats.errored,
					lastDid: stats.lastDid,
					cursor: cursor ?? null,
					heartbeatAt: new Date(),
				},
				select: { cancelRequested: true },
			});
			cachedCancel = row.cancelRequested;
		} catch (err) {
			console.error(`[reindex] flush error (${job.id})`, err);
		} finally {
			flushInFlight = false;
		}
	};

	// Independent heartbeat so the row stays "alive" for reclaim purposes even
	// when runDiscover is deep inside a single page that's taking a while.
	const heartbeat = setInterval(() => {
		flush().catch(() => {});
	}, PROGRESS_FLUSH_MS);

	try {
		const result = await runDiscover({
			relay: job.relay,
			concurrency: job.concurrency,
			limit: job.recordLimit,
			initialCursor: cursor,
			stats,
			deps: deps.process,
			shouldCancel: () => cachedCancel,
			onPageComplete: (next) => {
				cursor = next;
			},
		});

		clearInterval(heartbeat);
		// Final flush before status change so counters reflect the exact
		// end-of-run state that the status transition refers to.
		await flush();

		await prisma.reindexJob.update({
			where: { id: job.id },
			data: {
				status: result.cancelled ? "cancelled" : "completed",
				scanned: result.stats.scanned,
				reindexed: result.stats.reindexed,
				skipped: result.stats.skipped,
				errored: result.stats.errored,
				lastDid: result.stats.lastDid,
				cursor: result.cursor ?? null,
				finishedAt: new Date(),
				heartbeatAt: new Date(),
			},
		});
		console.log(
			`[reindex] ${result.cancelled ? "cancelled" : "completed"} ${job.id}: scanned=${result.stats.scanned} reindexed=${result.stats.reindexed} skipped=${result.stats.skipped} errored=${result.stats.errored}`,
		);
	} catch (err) {
		clearInterval(heartbeat);
		const message = err instanceof Error ? err.message : String(err);
		await prisma.reindexJob.update({
			where: { id: job.id },
			data: {
				status: "failed",
				errorMessage: message,
				scanned: stats.scanned,
				reindexed: stats.reindexed,
				skipped: stats.skipped,
				errored: stats.errored,
				lastDid: stats.lastDid,
				cursor: cursor ?? null,
				finishedAt: new Date(),
				heartbeatAt: new Date(),
			},
		});
		console.error(`[reindex] failed ${job.id}: ${message}`);
	}
}

async function dispatchJob(job: JobRow, deps: WorkerDeps): Promise<void> {
	if (job.kind === KIND_DISCOVER) {
		await executeDiscoverJob(job, deps);
		return;
	}
	// Unknown kind: mark failed so it doesn't block the queue. New kinds
	// should be added explicitly.
	await deps.prisma.reindexJob.update({
		where: { id: job.id },
		data: {
			status: "failed",
			errorMessage: `unknown kind: ${job.kind}`,
			finishedAt: new Date(),
		},
	});
	console.error(`[reindex] failed ${job.id}: unknown kind ${job.kind}`);
}

export type ReindexWorkerOptions = {
	prisma: PrismaClient;
	process: ProcessDeps;
};

export function startReindexWorker(
	opts: ReindexWorkerOptions,
): () => Promise<void> {
	const workerId = `${process.env.FLY_MACHINE_ID ?? "local"}-${randomUUID().slice(0, 8)}`;
	const deps: WorkerDeps = {
		prisma: opts.prisma,
		process: opts.process,
		workerId,
	};

	let stopped = false;
	let currentRun: Promise<void> = Promise.resolve();
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	async function tick(): Promise<void> {
		if (stopped) return;
		try {
			// Prefer reclaiming a stale `running` row over starting a fresh
			// pending one: a crashed job that resumes from cursor is cheaper
			// than paying the startup cost on a new one.
			const job = (await reclaimStale(deps)) ?? (await claimPending(deps));
			if (job) {
				await dispatchJob(job, deps);
				// Immediately poll again — there may be more queued work.
				if (!stopped) queueTick(0);
				return;
			}
		} catch (err) {
			console.error("[reindex] poller error", err);
		}
		if (!stopped) queueTick(POLL_INTERVAL_MS);
	}

	function queueTick(delayMs: number): void {
		if (stopped) return;
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = setTimeout(() => {
			pollTimer = null;
			currentRun = tick();
		}, delayMs);
	}

	console.log(`[reindex] worker ${workerId} started`);
	queueTick(0);

	return async () => {
		stopped = true;
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
		// Let the in-flight job complete its current flush loop before the
		// caller disconnects prisma. The job itself won't be stopped mid-run
		// — if we're shutting down, it'll complete naturally and the next
		// worker picks up any leftover queued jobs.
		await currentRun;
	};
}
