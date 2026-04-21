import { type AppBskyRichtextFacet, AtpAgent } from "@atproto/api";
import { getPublicUrl } from "../config.ts";
import type { DailyStats } from "./stats.ts";

function pluralize(n: number, singular: string, plural: string): string {
	return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}

// Build the post body and the link facet over the homepage URL in one pass so
// the UTF-8 byte offsets stay accurate through multibyte characters.
export function renderDailyPost(
	stats: DailyStats,
	url: string,
): { text: string; facets: Array<AppBskyRichtextFacet.Main> } {
	const lines = [
		"Branchline — last 24 hours",
		"",
		`Seeds planted: ${stats.seedsPlanted.toLocaleString("en-US")}`,
		`Stories bloomed: ${stats.storiesBloomed.toLocaleString("en-US")}`,
		`Pollen grains: ${pluralize(stats.pollenCount, "grain", "grains")}`,
		`New authors: ${stats.newAuthors.toLocaleString("en-US")}`,
		"",
		url,
	];
	const text = lines.join("\n");

	const encoder = new TextEncoder();
	const before = `${lines.slice(0, -1).join("\n")}\n`;
	const byteStart = encoder.encode(before).length;
	const byteEnd = byteStart + encoder.encode(url).length;

	const facets: Array<AppBskyRichtextFacet.Main> = [
		{
			index: { byteStart, byteEnd },
			features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
		},
	];

	return { text, facets };
}

/**
 * Fire-and-forget daily stats post to the central Branchline Bluesky account.
 *
 * No-op when `BRANCHLINE_BSKY_IDENTIFIER` / `BRANCHLINE_BSKY_APP_PASSWORD`
 * are unset — that's the expected shape in dev. Never throws: a scheduler
 * tick that fails to post just waits for tomorrow, we don't want one bad
 * login to take down the process group.
 */
export async function postDailyStatsToCentralBsky(
	stats: DailyStats,
): Promise<void> {
	const identifier = process.env.BRANCHLINE_BSKY_IDENTIFIER;
	const password = process.env.BRANCHLINE_BSKY_APP_PASSWORD;
	if (!identifier || !password) return;
	const service = process.env.BRANCHLINE_BSKY_SERVICE ?? "https://bsky.social";

	const { text, facets } = renderDailyPost(stats, getPublicUrl());

	try {
		const agent = new AtpAgent({ service });
		await agent.login({ identifier, password });
		await agent.post({ text, facets });
	} catch (err) {
		console.error("[scheduler] daily bsky post failed", err);
	}
}
