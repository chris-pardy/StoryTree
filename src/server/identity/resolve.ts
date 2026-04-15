import { AtprotoHandleResolverNode } from "@atproto-labs/handle-resolver-node";
import { prisma } from "../../db.ts";

const PLC_DIRECTORY_URL =
	process.env.PLC_DIRECTORY_URL ?? "https://plc.directory";

// Verified entries are invalidated by Jetstream identity events, not TTL —
// see `refreshCachedHandle`. Negative entries (failed fetch or verification
// mismatch) get a short retry TTL so a renamed/repaired account recovers
// within an hour even without an identity event.
const NEGATIVE_TTL_MS = 60 * 60 * 1000;

// Collection key + rkey for the Bluesky profile record we mine for display
// names. All three bsky-flavoured atproto clients (bsky.app, whitewind, etc.)
// write to the same path, so this is the canonical source.
const BSKY_PROFILE_COLLECTION = "app.bsky.actor.profile";
const BSKY_PROFILE_RKEY = "self";

const handleResolver = new AtprotoHandleResolverNode();

/**
 * Resolved identity info for one DID. Emitted by {@link resolveHandles}:
 * `handle` is null when we couldn't verify the DID's handle (the caller
 * should fall back to rendering the raw DID). `displayName` is null when
 * the author has no `app.bsky.actor.profile` record or the fetch failed.
 */
export type ResolvedActor = {
	handle: string | null;
	displayName: string | null;
};

type DidDocumentService = {
	id?: unknown;
	type?: unknown;
	serviceEndpoint?: unknown;
};

type DidDocument = {
	alsoKnownAs?: unknown;
	service?: unknown;
};

function didDocUrl(did: string): string | null {
	if (did.startsWith("did:plc:")) {
		return `${PLC_DIRECTORY_URL}/${did}`;
	}
	if (did.startsWith("did:web:")) {
		const ident = did.slice("did:web:".length);
		if (!ident) return null;
		const segments = ident.split(":").map((s) => {
			try {
				return decodeURIComponent(s);
			} catch {
				return s;
			}
		});
		const host = segments[0];
		if (!host) return null;
		const path =
			segments.length > 1
				? `/${segments.slice(1).join("/")}/did.json`
				: "/.well-known/did.json";
		return `https://${host}${path}`;
	}
	return null;
}

function extractHandle(doc: DidDocument): string | null {
	const aka = doc.alsoKnownAs;
	if (!Array.isArray(aka)) return null;
	for (const entry of aka) {
		if (typeof entry === "string" && entry.startsWith("at://")) {
			const handle = entry.slice("at://".length);
			if (handle.length > 0) return handle;
		}
	}
	return null;
}

function extractPdsEndpoint(doc: DidDocument): string | null {
	const services = doc.service;
	if (!Array.isArray(services)) return null;
	for (const entry of services as Array<DidDocumentService>) {
		// The id is relative (`#atproto_pds`) in PLC docs and absolute
		// (`did:plc:…#atproto_pds`) in some did:web docs — accept either.
		const id = typeof entry.id === "string" ? entry.id : "";
		if (!id.endsWith("#atproto_pds")) continue;
		const endpoint = entry.serviceEndpoint;
		if (typeof endpoint === "string" && endpoint.length > 0) return endpoint;
	}
	return null;
}

async function fetchDidDoc(did: string): Promise<DidDocument | null> {
	const url = didDocUrl(did);
	if (!url) return null;
	try {
		const res = await fetch(url, {
			headers: { accept: "application/did+json, application/json" },
		});
		if (!res.ok) return null;
		return (await res.json()) as DidDocument;
	} catch {
		return null;
	}
}

/**
 * Fetch `app.bsky.actor.profile/self` from the author's own PDS and pull out
 * the `displayName` string. Returns null on any failure mode — missing
 * record, network flake, malformed payload. Callers treat null as "no
 * display name" and never let it fail the larger identity resolve.
 */
async function fetchDisplayName(
	pdsUrl: string,
	did: string,
): Promise<string | null> {
	let url: URL;
	try {
		url = new URL("/xrpc/com.atproto.repo.getRecord", pdsUrl);
	} catch {
		return null;
	}
	url.searchParams.set("repo", did);
	url.searchParams.set("collection", BSKY_PROFILE_COLLECTION);
	url.searchParams.set("rkey", BSKY_PROFILE_RKEY);
	try {
		const res = await fetch(url, {
			headers: { accept: "application/json" },
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			value?: { displayName?: unknown };
		};
		const name = body.value?.displayName;
		if (typeof name !== "string") return null;
		const trimmed = name.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
}

async function resolveOne(did: string): Promise<ResolvedActor | null> {
	const doc = await fetchDidDoc(did);
	if (!doc) return null;
	const handle = extractHandle(doc);
	if (!handle) return null;
	let verifiedDid: string | null;
	try {
		verifiedDid = await handleResolver.resolve(handle);
	} catch {
		return null;
	}
	if (verifiedDid !== did) return null;

	// displayName is best-effort — an author with a verified handle but no
	// bsky profile record is perfectly valid and should still cache cleanly.
	const pdsUrl = extractPdsEndpoint(doc);
	const displayName = pdsUrl ? await fetchDisplayName(pdsUrl, did) : null;
	return { handle, displayName };
}

type CacheRow = {
	did: string;
	handle: string;
	displayName: string | null;
	verified: boolean;
	fetchedAt: Date;
};

function isFresh(row: CacheRow, now: number): boolean {
	if (row.verified) return true;
	return now - row.fetchedAt.getTime() < NEGATIVE_TTL_MS;
}

function rowToActor(row: CacheRow): ResolvedActor {
	return row.verified
		? { handle: row.handle, displayName: row.displayName }
		: { handle: null, displayName: null };
}

const NEGATIVE_ACTOR: ResolvedActor = { handle: null, displayName: null };

// `fallbackHandle` covers the negative-cache case: when resolution fails we
// still write a row so the next read short-circuits via NEGATIVE_TTL_MS, and
// the column needs *some* string. Callers pass the raw DID, except
// resolveDidFromHandle which already knows the handle the caller asked about.
function upsertHandleCache(
	did: string,
	actor: ResolvedActor | null,
	fallbackHandle: string,
) {
	const fields = {
		handle: actor?.handle ?? fallbackHandle,
		displayName: actor?.displayName ?? null,
		verified: actor !== null,
	};
	return prisma.handleCache.upsert({
		where: { did },
		create: { did, ...fields },
		update: { ...fields, fetchedAt: new Date() },
	});
}

/**
 * Resolve a batch of DIDs to their verified handles + bsky display names.
 *
 * Always returns an entry for every input DID: unverified DIDs come back as
 * `{ handle: null, displayName: null }` so call sites can render by falling
 * back to the raw DID. Hits cache first; misses are fetched in parallel and
 * persisted (including negative entries) before returning.
 */
export async function resolveHandles(
	dids: readonly string[],
): Promise<Map<string, ResolvedActor>> {
	const result = new Map<string, ResolvedActor>();
	const unique = [...new Set(dids)];
	if (unique.length === 0) return result;

	const cached = (await prisma.handleCache.findMany({
		where: { did: { in: unique } },
	})) as CacheRow[];

	const now = Date.now();
	const stale: string[] = [];
	const cachedByDid = new Map(cached.map((row) => [row.did, row]));

	for (const did of unique) {
		const row = cachedByDid.get(did);
		if (row && isFresh(row, now)) {
			result.set(did, rowToActor(row));
		} else {
			stale.push(did);
		}
	}

	if (stale.length === 0) return result;

	const resolved = await Promise.all(
		stale.map(async (did) => [did, await resolveOne(did)] as const),
	);

	await Promise.all(
		resolved.map(([did, actor]) => upsertHandleCache(did, actor, did)),
	);

	for (const [did, actor] of resolved) {
		result.set(did, actor ?? NEGATIVE_ACTOR);
	}
	return result;
}

/** Single-DID convenience wrapper around {@link resolveHandles}. */
export async function resolveActor(did: string): Promise<ResolvedActor> {
	const map = await resolveHandles([did]);
	return map.get(did) ?? NEGATIVE_ACTOR;
}

/**
 * Reverse of {@link resolveActor}: map a handle string to its DID. Hits the
 * `HandleCache` first for any verified row recorded against this handle; on
 * miss, falls back to the live atproto handle resolver and populates the
 * cache via {@link resolveOne} (which also pulls the display name). Returns
 * `null` when the handle can't be resolved.
 */
export async function resolveDidFromHandle(
	handle: string,
): Promise<string | null> {
	const cached = (await prisma.handleCache.findFirst({
		where: { handle, verified: true },
	})) as CacheRow | null;
	if (cached) return cached.did;

	let did: string | null;
	try {
		did = await handleResolver.resolve(handle);
	} catch {
		return null;
	}
	if (!did) return null;

	// We already know the DID; round-trip through resolveOne so the cache
	// row gets a displayName and the full DID-doc verification runs once.
	const actor = await resolveOne(did);
	await upsertHandleCache(did, actor, handle);
	return did;
}

/**
 * Indexer trigger: called when a new bud commit arrives. Ensures there is a
 * `HandleCache` row for the author DID. No-op if the DID is already cached
 * with a verified handle, or if a recent negative entry is still within its
 * retry TTL. Otherwise resolves the DID document and upserts the result.
 *
 * Safe to fire-and-forget from the Jetstream handler: errors here must not
 * abort ingest, so callers should catch/log rather than await.
 */
export async function ensureHandleCached(did: string): Promise<void> {
	const existing = (await prisma.handleCache.findUnique({
		where: { did },
	})) as CacheRow | null;

	if (existing && isFresh(existing, Date.now())) return;

	const actor = await resolveOne(did);
	await upsertHandleCache(did, actor, did);
}

/**
 * Indexer trigger: called when a Jetstream identity event arrives. Only acts
 * if the DID is already in our cache — an identity event for a DID we've
 * never seen is ignored, since we have no reader interest in it yet. When
 * the DID is cached, re-resolves from scratch (we treat the event as a
 * trusted invalidation signal, not a trusted handle source).
 *
 * If re-resolution fails for an already-verified row, we leave it alone
 * rather than downgrading to a negative entry. Resolution failures are
 * usually transient (PLC hiccup, local `.test` handles invisible to the
 * real directory, etc.) and clobbering a known-good handle would render
 * raw DIDs in the UI for the next NEGATIVE_TTL_MS window.
 */
export async function refreshCachedHandle(did: string): Promise<void> {
	const existing = (await prisma.handleCache.findUnique({
		where: { did },
	})) as CacheRow | null;
	if (!existing) return;

	const actor = await resolveOne(did);
	if (actor === null && existing.verified) return;

	await prisma.handleCache.update({
		where: { did },
		data: {
			handle: actor?.handle ?? did,
			displayName: actor?.displayName ?? null,
			verified: actor !== null,
			fetchedAt: new Date(),
		},
	});
}
