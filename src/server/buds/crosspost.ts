import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSessionAgent } from "../auth/session";
import { BSKY_MAX_POST_GRAPHEMES, getPublicUrl } from "../config";

const BSKY_POST_COLLECTION = "app.bsky.feed.post";

type InputSchema = {
	budUri: string;
	message: string;
};

type OutputSchema = {
	uri: string;
};

/**
 * Cross-posts a reference to a just-published bud to the author's Bluesky feed.
 * Uses the same OAuth agent as `publishBud` — the `app.bsky.feed.post` scope is
 * already requested in `src/server/auth/client.ts`, so no extra consent prompt.
 *
 * Failure here is intentionally non-fatal at the call site: the bud itself is
 * already persisted, so the UI should surface an error without rolling back.
 */
export const crosspostBudToBsky = createServerFn({ method: "POST" })
	.inputValidator((args: InputSchema) => args)
	.handler(async ({ data }): Promise<OutputSchema> => {
		const session = await getSessionAgent(getRequest());
		if (!session) {
			throw new Error("Unauthorized");
		}
		const { agent, did } = session;

		const parsed = parseAtUri(data.budUri);
		if (!parsed) {
			throw new Error("InvalidBudUri");
		}
		if (parsed.did !== did) {
			// Only the author can cross-post their own bud from their own PDS.
			throw new Error("Forbidden");
		}

		const publicUrl = getPublicUrl();
		// Per-piece anchor: lands the reader on the specific bud within its
		// story rather than the top of the leaf page. Matches the `<article id>`
		// emitted by StoryPiece via `anchorForBudUri`.
		const budUrl = `${publicUrl}/bud/${parsed.did}/${parsed.rkey}#bud-${parsed.rkey}`;

		const message = data.message.trim();
		const text = message ? `${message}\n\n${budUrl}` : budUrl;

		if (
			[...new Intl.Segmenter().segment(text)].length > BSKY_MAX_POST_GRAPHEMES
		) {
			throw new Error("PostTooLong");
		}

		const facets = [buildLinkFacet(text, budUrl)];

		const resp = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: BSKY_POST_COLLECTION,
			record: {
				$type: BSKY_POST_COLLECTION,
				text,
				facets,
				createdAt: new Date().toISOString(),
			},
			validate: true,
		});

		return { uri: resp.data.uri };
	});

function parseAtUri(uri: string): { did: string; rkey: string } | null {
	const stripped = uri.replace(/^at:\/\//, "");
	const parts = stripped.split("/");
	if (parts.length !== 3) return null;
	const [did, , rkey] = parts;
	if (!did || !rkey) return null;
	return { did, rkey };
}

function buildLinkFacet(text: string, url: string) {
	const encoder = new TextEncoder();
	const textBytes = encoder.encode(text);
	const urlBytes = encoder.encode(url);
	const byteStart = findBytesIndex(textBytes, urlBytes);
	const byteEnd = byteStart + urlBytes.length;
	return {
		index: { byteStart, byteEnd },
		features: [
			{
				$type: "app.bsky.richtext.facet#link",
				uri: url,
			},
		],
	};
}

function findBytesIndex(haystack: Uint8Array, needle: Uint8Array): number {
	outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) continue outer;
		}
		return i;
	}
	return 0;
}
