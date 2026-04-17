import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { queryKeys } from "./keys";

const fetchAuthorSeeds = createIsomorphicFn()
	.server(
		async (params: { actor: string; limit: number }): Promise<string[]> => {
			const { listAuthorSeeds } = await import("./author-seeds.server");
			return (await listAuthorSeeds(params)).seeds;
		},
	)
	.client(
		async (params: { actor: string; limit: number }): Promise<string[]> => {
			const searchParams = new URLSearchParams({
				actor: params.actor,
				limit: String(params.limit),
			});
			const res = await fetch(
				`/xrpc/ink.branchline.listAuthorSeeds?${searchParams.toString()}`,
			);
			if (!res.ok) throw new Error(`listAuthorSeeds failed: ${res.status}`);
			const data = await res.json();
			return data.seeds;
		},
	);

export function authorSeedsQuery(actor: string, limit = 50) {
	return queryOptions<string[]>({
		queryKey: queryKeys.authorSeeds(actor, limit),
		queryFn: () => fetchAuthorSeeds({ actor, limit }),
		staleTime: 60_000,
	});
}
