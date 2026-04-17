import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { BloomView } from "#/generated/lexicons/types/ink/branchline/listBlooms";
import { queryKeys } from "./keys";

export type { BloomView };

const fetchBlooms = createIsomorphicFn()
	.server(
		async (params: { sort: string; limit: number }): Promise<BloomView[]> => {
			const { listBlooms } = await import("./blooms.server");
			return (await listBlooms(params)).blooms;
		},
	)
	.client(
		async (params: { sort: string; limit: number }): Promise<BloomView[]> => {
			const searchParams = new URLSearchParams({
				sort: params.sort,
				limit: String(params.limit),
			});
			const res = await fetch(
				`/xrpc/ink.branchline.listBlooms?${searchParams.toString()}`,
			);
			if (!res.ok) throw new Error(`listBlooms failed: ${res.status}`);
			const data = await res.json();
			return data.blooms;
		},
	);

export function bloomsQuery(sort = "pollen", limit = 20) {
	return queryOptions<BloomView[]>({
		queryKey: queryKeys.blooms(sort, limit),
		queryFn: async () => {
			return fetchBlooms({ sort, limit });
		},
		staleTime: 60_000,
	});
}
