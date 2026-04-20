import type { $Typed, Agent, AppBskyEmbedExternal } from "@atproto/api";
import { TEXT_PREVIEW_LIMIT } from "../config";
import { renderBudOgPng } from "../og/render";
import { hydrateBuds } from "./hydrate";

/**
 * Build an `app.bsky.embed.external` for a bud — title, description, and a
 * thumbnail blob uploaded to the agent's PDS. Bluesky doesn't fetch OG meta
 * from the linked URL, so the cross-post / announcement paths attach this
 * themselves to make the card render in clients.
 *
 * Returns null on any failure (bud missing, render failure, upload failure)
 * so callers can fall back to a card-less post rather than dropping the
 * cross-post entirely.
 */
export async function buildBudExternalEmbed(args: {
	agent: Agent;
	budUri: string;
	budUrl: string;
}): Promise<$Typed<AppBskyEmbedExternal.Main> | null> {
	try {
		const [bud] = await hydrateBuds([args.budUri]);
		if (!bud) return null;

		const preview = (bud.text ?? "").slice(0, TEXT_PREVIEW_LIMIT);
		const authorLabel = bud.author?.displayName?.trim()
			? `${bud.author.displayName} (@${bud.author.handle})`
			: `@${bud.author?.handle ?? "anonymous"}`;
		const description = preview
			? `${preview} — by ${authorLabel} on Branchline`
			: `A bud by ${authorLabel} on Branchline`;

		const png = await renderBudOgPng({
			title: bud.title,
			authorDisplayName: bud.author?.displayName ?? null,
			authorHandle: bud.author?.handle ?? "anonymous",
			childCount: bud.children?.length ?? 0,
			pollenCount: bud.pollenCount,
		});

		const upload = await args.agent.uploadBlob(new Uint8Array(png), {
			encoding: "image/png",
		});

		return {
			$type: "app.bsky.embed.external",
			external: {
				uri: args.budUrl,
				title: bud.title,
				description,
				thumb: upload.data.blob,
			},
		};
	} catch (err) {
		console.error("[bsky] external embed build failed", err);
		return null;
	}
}
