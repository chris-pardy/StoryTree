import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { BloomView } from "#/generated/lexicons/types/ink/branchline/listAuthorBuds";
import { queryKeys } from "./keys";

const fetchAuthorBuds = createIsomorphicFn()
	.server(
		async (params: { actor: string; limit: number }): Promise<BloomView[]> => {
			const { listAuthorBuds } = await import("./author-buds.server");
			return (await listAuthorBuds(params)).buds;
		},
	)
	.client(
		async (params: { actor: string; limit: number }): Promise<BloomView[]> => {
			const searchParams = new URLSearchParams({
				actor: params.actor,
				limit: String(params.limit),
			});
			const res = await fetch(
				`/xrpc/ink.branchline.listAuthorBuds?${searchParams.toString()}`,
			);
			if (!res.ok) throw new Error(`listAuthorBuds failed: ${res.status}`);
			const data = await res.json();
			return data.buds;
		},
	);

export function authorBudsQuery(actor: string, limit = 50) {
	return queryOptions<BloomView[]>({
		queryKey: queryKeys.authorBuds(actor, limit),
		queryFn: () => fetchAuthorBuds({ actor, limit }),
		staleTime: 60_000,
	});
}
