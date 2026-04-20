import { type AppBskyRichtextFacet, AtpAgent } from "@atproto/api";
import { getPublicUrl } from "../config.ts";
import { resolveActor } from "../identity/resolve.ts";
import { buildBudExternalEmbed } from "./og-embed.ts";

export type PlantAnnouncement = {
	authorDid: string;
	title: string;
	budUri: string;
};

// Pool of intros so the branchline account doesn't repeat the same sentence
// on every plant. `{who}` is replaced by the mention (or a neutral fallback
// when handle resolution fails); `{title}` by the bud title in quotes.
const TEMPLATES: ReadonlyArray<string> = [
	`{who} just planted a new story: {title}`,
	`A new story has taken root from {who}: {title}`,
	`{who} dropped a seed — it's growing into {title}`,
	`Fresh from {who}: {title}`,
	`{who} started something new: {title}`,
	`New on branchline — {who} planted {title}`,
];

function pickTemplate(): string {
	return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
}

function parseAtUri(uri: string): { did: string; rkey: string } | null {
	const stripped = uri.replace(/^at:\/\//, "");
	const parts = stripped.split("/");
	if (parts.length !== 3) return null;
	const [did, , rkey] = parts;
	if (!did || !rkey) return null;
	return { did, rkey };
}

// Build facets off the UTF-8 byte offsets of `{who}` and `{title}` tokens in
// the template *before* substitution. We must assemble the output string and
// the facet offsets in one pass so the byte indexes stay consistent.
function renderPost(args: {
	template: string;
	who: string;
	whoDid: string | null;
	title: string;
	url: string;
}): { text: string; facets: Array<AppBskyRichtextFacet.Main> } {
	const encoder = new TextEncoder();
	const parts: Array<string> = [];
	const facets: Array<AppBskyRichtextFacet.Main> = [];
	let byteLen = 0;

	function push(chunk: string, kind: "mention" | "none", did?: string) {
		const start = byteLen;
		parts.push(chunk);
		byteLen += encoder.encode(chunk).length;
		if (kind === "mention" && did) {
			facets.push({
				index: { byteStart: start, byteEnd: byteLen },
				features: [{ $type: "app.bsky.richtext.facet#mention", did }],
			});
		}
	}

	// Split the template on the two tokens, preserving order. We only expect
	// each token at most once, which is true for every entry in TEMPLATES.
	const tokenRe = /(\{who\}|\{title\})/g;
	let lastIdx = 0;
	let match = tokenRe.exec(args.template);
	while (match !== null) {
		if (match.index > lastIdx) {
			push(args.template.slice(lastIdx, match.index), "none");
		}
		if (match[0] === "{who}") {
			push(
				args.who,
				args.whoDid ? "mention" : "none",
				args.whoDid ?? undefined,
			);
		} else {
			push(`"${args.title}"`, "none");
		}
		lastIdx = match.index + match[0].length;
		match = tokenRe.exec(args.template);
	}
	if (lastIdx < args.template.length) {
		push(args.template.slice(lastIdx), "none");
	}

	// Trailing link on its own line — add a link facet over the URL bytes.
	push("\n\n", "none");
	const urlStart = byteLen;
	parts.push(args.url);
	byteLen += encoder.encode(args.url).length;
	facets.push({
		index: { byteStart: urlStart, byteEnd: byteLen },
		features: [{ $type: "app.bsky.richtext.facet#link", uri: args.url }],
	});

	return { text: parts.join(""), facets };
}

/**
 * Fire-and-forget announcement on the central branchline Bluesky account that
 * a user has just planted a new story (a bud whose parent is a seed).
 *
 * Uses an app password via `BRANCHLINE_BSKY_IDENTIFIER` + `BRANCHLINE_BSKY_APP_PASSWORD`.
 * Logs in fresh per call — the call volume (one per plant) is low enough that
 * a persistent session isn't worth the state. If either env var is missing
 * the function is a no-op; this is the expected shape in dev and in CI.
 *
 * Never throws: the indexer must keep advancing even if Bluesky is down.
 */
export async function announcePlantToCentralBsky(
	args: PlantAnnouncement,
): Promise<void> {
	const identifier = process.env.BRANCHLINE_BSKY_IDENTIFIER;
	const password = process.env.BRANCHLINE_BSKY_APP_PASSWORD;
	if (!identifier || !password) return;
	const service = process.env.BRANCHLINE_BSKY_SERVICE ?? "https://bsky.social";

	const parsed = parseAtUri(args.budUri);
	if (!parsed) return;

	const publicUrl = getPublicUrl();
	const url = `${publicUrl}/bud/${parsed.did}/${parsed.rkey}#bud-${parsed.rkey}`;

	try {
		const actor = await resolveActor(args.authorDid);
		const whoHandle = actor.handle;
		// Fall back to a neutral phrase if we can't verify the handle — we still
		// announce the plant, just without a live mention.
		const who = whoHandle ? `@${whoHandle}` : "someone";
		const whoDid = whoHandle ? args.authorDid : null;

		const { text, facets } = renderPost({
			template: pickTemplate(),
			who,
			whoDid,
			title: args.title.trim() || "Untitled",
			url,
		});

		const agent = new AtpAgent({ service });
		await agent.login({ identifier, password });

		const embed = await buildBudExternalEmbed({
			agent,
			budUri: args.budUri,
			budUrl: url,
		});

		await agent.post({ text, facets, ...(embed ? { embed } : {}) });
	} catch (err) {
		console.error("[announce] central bsky post failed", err);
	}
}
