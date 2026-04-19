import { prisma } from "../../db.ts";

export type EnqueueTargetedResult = { enqueued: boolean; jobId: string | null };

/**
 * Enqueues a targeted reindex job for `did` if the app has never run one for
 * this DID before. One-shot backfill semantics — we check for ANY prior row
 * (pending/running/completed/failed/cancelled) and skip if found, so every
 * DID gets at most one targeted job across the app's lifetime.
 *
 * Callers are jetstream on first-sight (src/server/indexer/jetstream.ts) and
 * the OAuth callback (src/routes/api.auth.callback.ts). Both fire-and-forget:
 * reindex enqueue must not block ingest or login, so callers should catch
 * errors rather than await them in a critical path.
 */
export async function enqueueTargetedReindex(
	did: string,
): Promise<EnqueueTargetedResult> {
	const existing = await prisma.reindexJob.findFirst({
		where: { kind: "targeted", did },
		select: { id: true },
	});
	if (existing) return { enqueued: false, jobId: existing.id };

	const job = await prisma.reindexJob.create({
		data: { kind: "targeted", did, status: "pending" },
		select: { id: true },
	});
	return { enqueued: true, jobId: job.id };
}

export type DiscoverEnqueueInput = {
	relay: string;
	concurrency: number;
	recordLimit: number | null;
};

/**
 * Enqueues a discover job. Unlike targeted enqueues, discover jobs aren't
 * deduped — each invocation is a separate crawl request and multiple may
 * exist concurrently. The worker claims them in FIFO order.
 */
export async function enqueueDiscoverJob(
	input: DiscoverEnqueueInput,
): Promise<{ id: string }> {
	const job = await prisma.reindexJob.create({
		data: {
			kind: "discover",
			status: "pending",
			relay: input.relay,
			concurrency: input.concurrency,
			recordLimit: input.recordLimit,
		},
		select: { id: true },
	});
	return { id: job.id };
}
