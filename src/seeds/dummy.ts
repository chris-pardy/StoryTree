/**
 * Temporary hand-rolled seed grants used by the UI shell. Once the
 * `ink.branchline.seedGrant` lexicon + indexer land, both the /seeds listing
 * and the /seed/$ detail page will read from the AppView instead of this
 * module; the listing becomes a recipient-scoped aggregation query and the
 * detail page becomes a loader over `SeedGrantNode` + chain walk.
 *
 * The AT-URIs below are stable so deep-links from the listing into the
 * detail page round-trip cleanly during development.
 */
export type DummySeed = {
	uri: string;
	giftedBy: string;
	giftedAt: string;
	note?: string;
};

export const DUMMY_SEEDS: DummySeed[] = [
	{
		uri: "at://did:plc:branchlinedemo/ink.branchline.seedGrant/seed01demoa",
		giftedBy: "branchline.ink",
		giftedAt: "2026-04-10T14:22:00Z",
		note: "For the April anthology.",
	},
	{
		uri: "at://did:plc:rosalinddemo/ink.branchline.seedGrant/seed02demob",
		giftedBy: "rosalind.bsky.social",
		giftedAt: "2026-04-12T09:05:00Z",
	},
	{
		uri: "at://did:plc:branchlinedemo/ink.branchline.seedGrant/seed03democ",
		giftedBy: "branchline.ink",
		giftedAt: "2026-04-14T21:40:00Z",
		note: "Use it when the mood strikes.",
	},
];

export function findDummySeed(uri: string): DummySeed | undefined {
	return DUMMY_SEEDS.find((s) => s.uri === uri);
}

/**
 * Build the `/seed/$` splat fragment for a given at:// URI. Strips the
 * `at://` prefix so the splat matches the existing `/at/$` convention
 * documented on `parseFullAtUri`.
 */
export function seedDetailSplat(uri: string): string {
	return uri.replace(/^at:\/\//, "");
}

/**
 * Format an ISO timestamp as a short date for card meta lines.
 */
export function formatGiftedAt(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
