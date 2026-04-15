export const TEXT_PREVIEW_LIMIT = 240;

// Bloom eligibility windows (see blooms/feed.ts and blooms/rank.ts).
// `GROWING_WINDOW_HOURS` is the floor: buds younger than this are still
// "growing" and not surfaced as blooms. `FOLLOW_WINDOW_HOURS` is the ceiling
// for the follow-rail: past this, only childless buds remain eligible.
export const GROWING_WINDOW_HOURS = 24;
export const FOLLOW_WINDOW_HOURS = 48;

// Bluesky post graphemes — used by buds/crosspost.ts to gate text length
// before we attempt the createRecord. Matches `app.bsky.feed.post`.
export const BSKY_MAX_POST_GRAPHEMES = 300;

export function getPublicUrl(): string {
	return process.env.PUBLIC_URL ?? "http://127.0.0.1:3000";
}
