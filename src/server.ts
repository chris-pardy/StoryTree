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
	bootDailyScheduler,
	stopDailyScheduler,
} from "./server/scheduler/boot.ts";

// Runs once per server boot. In dev (vite) this module is re-evaluated on
// HMR, but the boot helpers are idempotent — the dispose hook below tears
// down the previous subscriber/scheduler before the new one starts.
bootstrapPermissions().catch((err) => console.error("[permissions]", err));
bootJetstreamSubscriber();
bootDailyScheduler();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		// Fire-and-forget: HMR doesn't wait on async dispose, but we still want
		// the in-flight worker to drain + the cursor to flush before the new
		// module takes over. Awaiting inside catch keeps stray errors out of the
		// HMR pipeline.
		stopJetstreamSubscriber().catch((err) =>
			console.error("[indexer] HMR dispose error", err),
		);
		stopDailyScheduler().catch((err) =>
			console.error("[scheduler] HMR dispose error", err),
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
