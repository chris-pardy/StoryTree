import { createServerFn } from "@tanstack/react-start";
import { getPublicUrl, TEXT_PREVIEW_LIMIT } from "#/server/config";
import { hydrateBuds } from "./hydrate";

export type BudMeta = {
	title: string;
	preview: string;
	authorDisplayName: string | null;
	authorHandle: string;
	publicUrl: string;
};

/**
 * Server-only companion to the `/bud/$` client loader — returns the minimum
 * fields required for <head> meta tags (title, description, og:image URL).
 * Kept separate from the full React Query `budQuery` hydration path so head()
 * can stay synchronous relative to loaderData without pulling the full feed.
 * `publicUrl` is included so head() can build absolute og:image URLs without
 * needing its own server roundtrip.
 */
export const loadBudMeta = createServerFn({ method: "GET" })
	.inputValidator((args: { uri: string }) => args)
	.handler(async ({ data }): Promise<BudMeta | null> => {
		const [bud] = await hydrateBuds([data.uri]);
		if (!bud) return null;
		return {
			title: bud.title,
			preview: (bud.text ?? "").slice(0, TEXT_PREVIEW_LIMIT),
			authorDisplayName: bud.author?.displayName ?? null,
			authorHandle: bud.author?.handle ?? "anonymous",
			publicUrl: getPublicUrl(),
		};
	});
