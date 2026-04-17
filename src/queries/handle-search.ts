import { queryOptions } from "@tanstack/react-query";

export type SearchedActor = {
	did: string;
	handle: string;
	displayName?: string;
	avatar?: string;
};

const BSKY_PUBLIC_API = "https://public.api.bsky.app";

async function searchActorsTypeahead(
	query: string,
	limit = 8,
): Promise<SearchedActor[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
	const res = await fetch(
		`${BSKY_PUBLIC_API}/xrpc/app.bsky.actor.searchActorsTypeahead?${params.toString()}`,
	);
	if (!res.ok) return [];
	const data = (await res.json()) as { actors?: SearchedActor[] };
	return data.actors ?? [];
}

export function handleSearchQuery(q: string) {
	const trimmed = q.trim();
	return queryOptions<SearchedActor[]>({
		queryKey: ["handle-search", trimmed],
		queryFn: () => searchActorsTypeahead(trimmed),
		enabled: trimmed.length > 0,
		staleTime: 60_000,
	});
}
