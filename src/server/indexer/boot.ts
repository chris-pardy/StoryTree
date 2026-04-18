import { prisma } from "../../db.ts";
import { bootstrapPermissions } from "../permissions.ts";
import { startJetstreamSubscriber } from "./jetstream.ts";

declare global {
	// eslint-disable-next-line no-var
	var __jetstreamStop: (() => Promise<void>) | undefined;
}

// Starts the jetstream subscriber inside the current node process. Safe to
// call many times — only the first call starts a subscriber, subsequent calls
// are no-ops. HMR disposes (in src/server.ts) unset the global so the next
// module evaluation picks up a fresh subscriber with fresh code.
export function bootJetstreamSubscriber(): void {
	if (process.env.INDEXER_ENABLED !== "true") return;
	// On Fly, every machine runs the same `node server.js` command and inherits
	// INDEXER_ENABLED=true from [env]. Gate on FLY_PROCESS_GROUP so only the
	// "indexer" machine actually starts the subscriber; "web" machines serve
	// HTTP and skip it. FLY_PROCESS_GROUP is unset off-Fly, so dev still boots.
	const flyGroup = process.env.FLY_PROCESS_GROUP;
	if (flyGroup && flyGroup !== "indexer") return;
	if (globalThis.__jetstreamStop) return;

	// Ensure env-var-bootstrapped admins have Permission rows before the
	// subscriber starts processing seed-create events.
	bootstrapPermissions().catch((err) => console.error("[permissions]", err));

	const url = process.env.JETSTREAM_URL ?? "ws://localhost:6010/subscribe";

	const stop = startJetstreamSubscriber({
		url,
		deps: {
			prisma,
			now: () => new Date(),
		},
		onError: (err) => console.error("[indexer]", err),
	});

	globalThis.__jetstreamStop = stop;
	console.log(`[indexer] booted in-process against ${url}`);
}

// Used by HMR dispose hooks and by graceful shutdown paths. Safe to call even
// if the subscriber was never started.
export async function stopJetstreamSubscriber(): Promise<void> {
	const stop = globalThis.__jetstreamStop;
	if (!stop) return;
	globalThis.__jetstreamStop = undefined;
	await stop();
}
