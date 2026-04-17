import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { budQuery } from "./buds";
import { queryKeys } from "./keys";

const fetchBranch = createIsomorphicFn()
	.server(async (bud: string): Promise<string[]> => {
		const { getBranch } = await import("./branch.server");
		return (await getBranch({ bud })).buds;
	})
	.client(async (bud: string): Promise<string[]> => {
		const params = new URLSearchParams({ bud });
		const res = await fetch(
			`/xrpc/ink.branchline.getBranch?${params.toString()}`,
		);
		if (!res.ok) throw new Error(`getBranch failed: ${res.status}`);
		const data = await res.json();
		return data.buds;
	});

export function branchQuery(bud: string) {
	return queryOptions<string[]>({
		queryKey: queryKeys.branch(bud),
		queryFn: async ({ client }) => {
			const buds = await fetchBranch(bud);

			for (let i = 0; i < buds.length; i++) {
				client.setQueryData(queryKeys.branch(buds[i]), buds.slice(0, i + 1));
				client.prefetchQuery(budQuery(buds[i], buds.slice(0, i)));
			}

			return buds;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});
}
