import { prisma } from "../../db.ts";
import { startReindexWorker } from "./worker.ts";

declare global {
	// eslint-disable-next-line no-var
	var __reindexWorkerStop: (() => Promise<void>) | undefined;
}

// Starts the reindex-job worker inside the current node process. On Fly
// the worker runs on its own `reindex` process group (see fly.toml) — a
// full bsky.network discover sweep can take weeks, and letting it share
// the `indexer` machine risks starving the jetstream subscriber's DB pool.
// Off-Fly (dev), FLY_PROCESS_GROUP is unset and the gate falls through so
// the worker still runs alongside dev's in-process indexer.
export function bootReindexWorker(): void {
	if (process.env.INDEXER_ENABLED !== "true") return;
	const flyGroup = process.env.FLY_PROCESS_GROUP;
	if (flyGroup && flyGroup !== "reindex") return;
	if (globalThis.__reindexWorkerStop) return;

	const stop = startReindexWorker({
		prisma,
		process: { prisma, now: () => new Date() },
	});
	globalThis.__reindexWorkerStop = stop;
}

export async function stopReindexWorker(): Promise<void> {
	const stop = globalThis.__reindexWorkerStop;
	if (!stop) return;
	globalThis.__reindexWorkerStop = undefined;
	await stop();
}
