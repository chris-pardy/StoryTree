import { prisma } from "../../db.ts";
import { startReindexWorker } from "./worker.ts";

declare global {
	// eslint-disable-next-line no-var
	var __reindexWorkerStop: (() => Promise<void>) | undefined;
}

// Starts the reindex-job worker inside the current node process. Gated on
// REINDEX_WORKER_ENABLED rather than INDEXER_ENABLED so the jetstream
// subscriber and this worker can be toggled independently — locally the
// "one repo" case makes a discover sweep trivial, so turning on just this
// env var is enough to dev-test the queue/worker flow without having to
// spin up jetstream too. On Fly the same env var is set globally in [env]
// and the FLY_PROCESS_GROUP check keeps the worker isolated to the
// dedicated `reindex` machine.
export function bootReindexWorker(): void {
	if (process.env.REINDEX_WORKER_ENABLED !== "true") return;
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
