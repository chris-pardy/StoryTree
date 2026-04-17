import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { PlantingView } from "#/generated/lexicons/types/ink/branchline/listAuthorPlantings";
import { queryKeys } from "./keys";

const fetchAuthorPlantings = createIsomorphicFn()
	.server(
		async (params: {
			actor: string;
			limit: number;
		}): Promise<PlantingView[]> => {
			const { listAuthorPlantings } = await import("./author-plantings.server");
			return (await listAuthorPlantings(params)).plantings;
		},
	)
	.client(
		async (params: {
			actor: string;
			limit: number;
		}): Promise<PlantingView[]> => {
			const searchParams = new URLSearchParams({
				actor: params.actor,
				limit: String(params.limit),
			});
			const res = await fetch(
				`/xrpc/ink.branchline.listAuthorPlantings?${searchParams.toString()}`,
			);
			if (!res.ok) throw new Error(`listAuthorPlantings failed: ${res.status}`);
			const data = await res.json();
			return data.plantings;
		},
	);

export function authorPlantingsQuery(actor: string, limit = 50) {
	return queryOptions<PlantingView[]>({
		queryKey: queryKeys.authorPlantings(actor, limit),
		queryFn: () => fetchAuthorPlantings({ actor, limit }),
		staleTime: 60_000,
	});
}
