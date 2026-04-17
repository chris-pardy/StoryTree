import {
	ensureHandleCached,
	refreshCachedHandle,
} from "../identity/resolve.ts";
import {
	type JetstreamCommitCreate,
	type JetstreamCommitDelete,
	type JetstreamCommitUpdate,
	type ProcessDeps,
	type ProcessResult,
	processBudCreate,
	processBudDelete,
	processBudUpdate,
	processPollenCreate,
	processPollenDelete,
	processSeedCreate,
	processSeedDelete,
	processSeedUpdate,
} from "./process.ts";

export const BUD_COLLECTION = "ink.branchline.bud";
export const POLLEN_COLLECTION = "ink.branchline.pollen";
export const SEED_COLLECTION = "ink.branchline.seed";

const WANTED_COLLECTIONS = [
	BUD_COLLECTION,
	POLLEN_COLLECTION,
	SEED_COLLECTION,
] as const;

// Singleton key for the persisted cursor row.
const CURSOR_ID = "jetstream";

// Rewind the saved cursor by 1s on reconnect so we don't miss events that
// shared a microsecond with the last one we persisted. Duplicates are safe:
// every write in process.ts is idempotent.
const CURSOR_REWIND_US = 1_000_000n;

// Jetstream is chatty enough that real idle never happens in practice, so
// prolonged silence means the TCP connection stalled and we should force a
// reconnect to recover.
const IDLE_TIMEOUT_MS = 60_000;

// How often to flush the in-memory cursor to Postgres. Losing up to this much
// progress on a crash just means a short replay on restart.
const CURSOR_FLUSH_INTERVAL_MS = 2_000;

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type JetstreamSubscriberOptions = {
	url: string;
	deps: ProcessDeps;
	onError?: (err: unknown) => void;
};

type AnyCommit =
	| JetstreamCommitCreate
	| JetstreamCommitUpdate
	| JetstreamCommitDelete;

// Narrow runtime guard for untrusted frames. We only check the fields that
// dispatch + the worker will read; record shape is validated deeper in
// validate*Create/Update.
function isCommitFrame(data: unknown): data is AnyCommit {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	if (d.kind !== "commit") return false;
	if (typeof d.did !== "string") return false;
	if (typeof d.time_us !== "number") return false;
	const commit = d.commit;
	if (!commit || typeof commit !== "object") return false;
	const c = commit as Record<string, unknown>;
	if (typeof c.collection !== "string") return false;
	if (typeof c.rkey !== "string") return false;
	return (
		c.operation === "create" ||
		c.operation === "update" ||
		c.operation === "delete"
	);
}

async function dispatch(
	event: AnyCommit,
	deps: ProcessDeps,
): Promise<ProcessResult | null> {
	const { collection, operation } = event.commit;
	if (collection === BUD_COLLECTION) {
		switch (operation) {
			case "create":
				return processBudCreate(event as JetstreamCommitCreate, deps);
			case "update":
				return processBudUpdate(event as JetstreamCommitUpdate, deps);
			case "delete":
				return processBudDelete(event as JetstreamCommitDelete, deps);
		}
	}
	if (collection === POLLEN_COLLECTION) {
		switch (operation) {
			case "create":
				return processPollenCreate(event as JetstreamCommitCreate, deps);
			case "delete":
				return processPollenDelete(event as JetstreamCommitDelete, deps);
			case "update":
				return { accepted: false, reason: "pollen-update-not-supported" };
		}
	}
	if (collection === SEED_COLLECTION) {
		switch (operation) {
			case "create":
				return processSeedCreate(event as JetstreamCommitCreate, deps);
			case "update":
				return processSeedUpdate(event as JetstreamCommitUpdate, deps);
			case "delete":
				return processSeedDelete(event as JetstreamCommitDelete, deps);
		}
	}
	return null;
}

export function startJetstreamSubscriber(
	opts: JetstreamSubscriberOptions,
): () => Promise<void> {
	const { url, deps, onError } = opts;
	const { prisma } = deps;

	let ws: WebSocket | null = null;
	let stopped = false;
	let reconnectAttempt = 0;
	let gotMessageSinceOpen = false;

	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let cursorFlushTimer: ReturnType<typeof setInterval> | null = null;

	// FIFO queue + single worker. Guarantees that events for the same rkey land
	// in DB in the order jetstream emitted them — a create followed by a fast
	// update can no longer race past each other.
	const queue: AnyCommit[] = [];
	let workerRunning = false;
	let workerPromise: Promise<void> = Promise.resolve();

	// Highest time_us we've processed but not yet persisted.
	let pendingCursor: bigint | null = null;

	function clearIdleTimer() {
		if (idleTimer) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	}

	function resetIdleTimer() {
		clearIdleTimer();
		idleTimer = setTimeout(() => {
			console.log(
				`[indexer] jetstream idle > ${IDLE_TIMEOUT_MS}ms, forcing reconnect`,
			);
			ws?.close();
		}, IDLE_TIMEOUT_MS);
	}

	async function loadCursor(): Promise<bigint | null> {
		const row = await prisma.indexerCursor.findUnique({
			where: { id: CURSOR_ID },
		});
		return row ? row.timeUs : null;
	}

	async function flushCursor(): Promise<void> {
		if (pendingCursor === null) return;
		const value = pendingCursor;
		pendingCursor = null;
		try {
			await prisma.indexerCursor.upsert({
				where: { id: CURSOR_ID },
				create: { id: CURSOR_ID, timeUs: value },
				update: { timeUs: value },
			});
		} catch (err) {
			// Restore so the next tick retries. Only replace if nothing newer has
			// arrived in the meantime.
			if (pendingCursor === null || pendingCursor < value) {
				pendingCursor = value;
			}
			onError?.(err);
		}
	}

	async function runWorker(): Promise<void> {
		workerRunning = true;
		try {
			while (queue.length > 0) {
				const event = queue.shift();
				if (!event) break;
				try {
					const result = await dispatch(event, deps);
					if (result) {
						const tag = `${event.commit.collection.split(".").pop()} ${event.did}/${event.commit.rkey}`;
						if (result.accepted) {
							console.log(`[indexer] ${event.commit.operation} ${tag}`);
						} else {
							console.log(
								`[indexer] dropped ${event.commit.operation} ${tag}: ${result.reason}`,
							);
						}
					}
				} catch (err) {
					onError?.(err);
				}
				// Advance the cursor even on dispatch failure so we don't wedge on a
				// poison pill. Idempotent upserts make replay-on-restart safe anyway.
				const us = BigInt(event.time_us);
				if (pendingCursor === null || us > pendingCursor) {
					pendingCursor = us;
				}
			}
		} finally {
			workerRunning = false;
		}
	}

	function enqueue(event: AnyCommit) {
		queue.push(event);
		if (!workerRunning) {
			workerPromise = runWorker().catch((err) => {
				onError?.(err);
			});
		}
	}

	async function connect(): Promise<void> {
		if (stopped) return;

		const sub = new URL(url);
		for (const c of WANTED_COLLECTIONS) {
			sub.searchParams.append("wantedCollections", c);
		}

		let savedCursor: bigint | null = null;
		try {
			savedCursor = await loadCursor();
		} catch (err) {
			onError?.(err);
		}

		if (savedCursor !== null) {
			const resumeFrom = savedCursor - CURSOR_REWIND_US;
			sub.searchParams.set(
				"cursor",
				(resumeFrom > 0n ? resumeFrom : 0n).toString(),
			);
		}

		const socket = new WebSocket(sub.toString());
		ws = socket;

		socket.addEventListener("open", () => {
			console.log(`[indexer] connected to jetstream at ${sub.toString()}`);
			gotMessageSinceOpen = false;
			resetIdleTimer();
		});

		socket.addEventListener("message", (ev) => {
			if (stopped) return;
			resetIdleTimer();

			// Tie reconnect-attempt reset to receiving real data, not just the
			// socket opening. A connection that opens-then-immediately-closes
			// without ever delivering a message should still back off.
			if (!gotMessageSinceOpen) {
				gotMessageSinceOpen = true;
				reconnectAttempt = 0;
			}

			try {
				const raw =
					typeof ev.data === "string"
						? ev.data
						: (ev.data as { toString(): string }).toString();
				const data = JSON.parse(raw);

				// Identity events are global and fire on every network-wide handle/PDS
				// change. refreshCachedHandle is a no-op for DIDs we've never cached.
				if (data && data.kind === "identity" && typeof data.did === "string") {
					refreshCachedHandle(data.did).catch((err) => onError?.(err));
					return;
				}

				if (!isCommitFrame(data)) return;

				// Warm handle cache on first bud from a new author. Fire-and-forget:
				// network latency must not block ingest. Skip pollen (by design) and
				// bud updates/deletes (authorDid is immutable after create).
				if (
					data.commit.collection === BUD_COLLECTION &&
					data.commit.operation === "create"
				) {
					ensureHandleCached(data.did).catch((err) => onError?.(err));
				}

				enqueue(data);
			} catch (err) {
				onError?.(err);
			}
		});

		socket.addEventListener("error", (ev) => {
			onError?.(ev);
			// 'close' will follow and drive the reconnect path.
		});

		socket.addEventListener("close", () => {
			clearIdleTimer();
			if (ws === socket) ws = null;
			console.log("[indexer] jetstream connection closed");
			scheduleReconnect();
		});
	}

	function scheduleReconnect() {
		if (stopped) return;
		if (reconnectTimer) return;
		const delay = Math.min(
			MAX_RECONNECT_DELAY_MS,
			BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt,
		);
		reconnectAttempt++;
		console.log(
			`[indexer] reconnecting in ${delay}ms (attempt ${reconnectAttempt})`,
		);
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect().catch((err) => onError?.(err));
		}, delay);
	}

	cursorFlushTimer = setInterval(() => {
		flushCursor().catch((err) => onError?.(err));
	}, CURSOR_FLUSH_INTERVAL_MS);

	connect().catch((err) => onError?.(err));

	return async () => {
		stopped = true;
		clearIdleTimer();
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (cursorFlushTimer) {
			clearInterval(cursorFlushTimer);
			cursorFlushTimer = null;
		}
		ws?.close();
		// Drain any in-flight worker so Prisma queries complete before the caller
		// disconnects the client.
		await workerPromise;
		await flushCursor();
	};
}
