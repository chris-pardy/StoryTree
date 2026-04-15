export type Story = {
	id: string;
	title?: string;
	/** Author DID — the stable identity key used for auth/permission checks. */
	author: string;
	/** Verified handle for display. Undefined when unresolved (fall back to DID). */
	authorHandle?: string;
	/** Bluesky profile `displayName`, when the author has one. */
	authorDisplayName?: string;
	timestamp: string;
	pollen: number;
	body: string;
	fresh?: boolean;
};

export type DraftStory = { title: string; body: string };
