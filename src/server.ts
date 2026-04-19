import type { Register } from "@tanstack/react-router";
import {
	createStartHandler,
	defaultStreamHandler,
	type RequestHandler,
} from "@tanstack/react-start/server";
import {
	bootJetstreamSubscriber,
	stopJetstreamSubscriber,
} from "./server/indexer/boot.ts";
import { bootstrapPermissions } from "./server/permissions.ts";
import {
	bootReindexWorker,
	stopReindexWorker,
} from "./server/reindex/boot.ts";

// Runs once per server boot. In dev (vite) this module is re-evaluated on
// HMR, but the boot helper is idempotent — the dispose hook below tears down
// the previous subscriber before the new one starts.
bootstrapPermissions().catch((err) => console.error("[permissions]", err));
bootJetstreamSubscriber();
bootReindexWorker();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		// Fire-and-forget: HMR doesn't wait on async dispose, but we still want
		// the in-flight worker to drain + the cursor to flush before the new
		// module takes over. Awaiting inside catch keeps stray errors out of the
		// HMR pipeline.
		stopJetstreamSubscriber().catch((err) =>
			console.error("[indexer] HMR dispose error", err),
		);
		stopReindexWorker().catch((err) =>
			console.error("[reindex] HMR dispose error", err),
		);
	});
}

const fetch = createStartHandler(defaultStreamHandler);

export type ServerEntry = { fetch: RequestHandler<Register> };

export function createServerEntry(entry: ServerEntry): ServerEntry {
	return {
		async fetch(...args) {
			return await entry.fetch(...args);
		},
	};
}

export default createServerEntry({ fetch });
