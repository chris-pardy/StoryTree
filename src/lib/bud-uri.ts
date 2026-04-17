const DEFAULT_BUD_COLLECTION = "ink.branchline.bud";

/**
 * `/at://did/collection/rkey` — parse from splat with leading `//`.
 */
export function parseFullAtUri(splat: string): string | null {
	const stripped = splat.replace(/^\/+/, "");
	if (!stripped) return null;
	const uri = `at://${stripped}`;
	const parts = stripped.split("/");
	if (parts.length < 3) return null;
	return uri;
}

/**
 * `/bud/<did-or-handle>/<rkey>` — reconstruct to a default-collection AT-URI.
 */
export function parseBudShorthand(splat: string): string | null {
	const stripped = splat.replace(/^\/+/, "");
	const parts = stripped.split("/");
	if (parts.length !== 2) return null;
	const [identifier, rkey] = parts;
	if (!identifier || !rkey) return null;
	return `at://${identifier}/${DEFAULT_BUD_COLLECTION}/${rkey}`;
}

/**
 * Stable per-bud DOM anchor id (`bud-<rkey>`).
 */
export function anchorForBudUri(uri: string): string | null {
	const parts = uri.replace(/^at:\/\//, "").split("/");
	if (parts.length !== 3) return null;
	return `bud-${parts[2]}`;
}

/**
 * Parse an AT-URI into `did/rkey` for the `/bud/$` route splat.
 */
export function parseBudSplat(uri: string): string {
	const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
	return m ? `${m[1]}/${m[2]}` : "";
}
