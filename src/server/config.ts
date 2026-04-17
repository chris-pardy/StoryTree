export const TEXT_PREVIEW_LIMIT = 240;

// Follow window (see blooms/feed.ts and blooms/rank.ts).
// A bud blooms at its `bloomsAt` timestamp. `FOLLOW_WINDOW_HOURS` is how
// long after blooming a bud stays in the feed — past this, only childless
// buds remain eligible.
export const FOLLOW_WINDOW_HOURS = 24;

// Bluesky post graphemes — used by buds/crosspost.ts to gate text length
// before we attempt the createRecord. Matches `app.bsky.feed.post`.
export const BSKY_MAX_POST_GRAPHEMES = 300;

export function getPublicUrl(): string {
	return process.env.PUBLIC_URL ?? "http://127.0.0.1:3000";
}
