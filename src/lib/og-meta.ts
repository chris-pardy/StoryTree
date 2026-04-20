/**
 * Build the standard OG / Twitter meta tag set for a page. Used by route
 * `head()` callbacks so each page doesn't repeat the same eight tags.
 *
 * `imageUrl` and `pageUrl` must be absolute — Bluesky / Slack / Twitter all
 * require absolute URLs in `og:image` to render a card.
 */
export function siteOgMeta(args: {
	title: string;
	description: string;
	imageUrl: string;
	pageUrl: string;
	type?: "website" | "article" | "profile";
}): Array<Record<string, string>> {
	const type = args.type ?? "website";
	return [
		{ title: args.title },
		{ name: "description", content: args.description },
		{ property: "og:type", content: type },
		{ property: "og:title", content: args.title },
		{ property: "og:description", content: args.description },
		{ property: "og:url", content: args.pageUrl },
		{ property: "og:image", content: args.imageUrl },
		{ property: "og:image:width", content: "1200" },
		{ property: "og:image:height", content: "630" },
		{ property: "og:site_name", content: "Branchline" },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: args.title },
		{ name: "twitter:description", content: args.description },
		{ name: "twitter:image", content: args.imageUrl },
	];
}
