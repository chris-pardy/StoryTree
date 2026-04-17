import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { BudView } from "#/generated/lexicons/types/ink/branchline/getBuds";
import { queryKeys } from "./keys";

export type { BudView };

const fetchBuds = createIsomorphicFn()
	.server(async (uris: string[]): Promise<BudView[]> => {
		const { getBuds } = await import("./buds.server");
		return (await getBuds({ uris })).buds;
	})
	.client(async (uris: string[]): Promise<BudView[]> => {
		const params = new URLSearchParams();
		for (const uri of uris) params.append("uris", uri);
		const res = await fetch(
			`/xrpc/ink.branchline.getBuds?${params.toString()}`,
		);
		if (!res.ok) throw new Error(`getBuds failed: ${res.status}`);
		const data = await res.json();
		return data.buds;
	});

type Pending = {
	resolve: (bud: BudView) => void;
	reject: (err: Error) => void;
};

const pending = new Map<string, Pending[]>();
let scheduled = false;

function fetchBudBatched(uri: string): Promise<BudView> {
	return new Promise<BudView>((resolve, reject) => {
		if (!pending.has(uri)) pending.set(uri, []);
		pending.get(uri)?.push({ resolve, reject });
		if (!scheduled) {
			scheduled = true;
			queueMicrotask(flushBatch);
		}
	});
}

async function flushBatch() {
	const batch = new Map(pending);
	pending.clear();
	scheduled = false;

	try {
		let remaining = [...batch.keys()];
		while (remaining.length > 0) {
			const buds = await fetchBuds(remaining);
			for (const bud of buds) {
				const waiters = batch.get(bud.uri);
				if (waiters) {
					for (const w of waiters) w.resolve(bud);
					batch.delete(bud.uri);
				}
			}
			remaining = [...batch.keys()];
			if (buds.length === 0) break;
		}
		for (const [, waiters] of batch) {
			for (const w of waiters) w.reject(new Error("bud not found"));
		}
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		for (const [, waiters] of batch) {
			for (const w of waiters) w.reject(error);
		}
	}
}

export function budQuery(uri: string, pathToHere?: string[]) {
	return queryOptions<BudView>({
		queryKey: queryKeys.bud(uri),
		queryFn: async ({ client }) => {
			const bud = await fetchBudBatched(uri);
			if (pathToHere && bud.children) {
				const path = [...pathToHere, uri];
				for (const childUri of bud.children) {
					client.setQueryData(queryKeys.branch(childUri), [...path, childUri]);
				}
			}
			return bud;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});
}
