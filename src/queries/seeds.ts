import { queryOptions } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { SeedView } from "#/generated/lexicons/types/ink/branchline/getSeeds";
import { queryKeys } from "./keys";

export type { SeedView };

const fetchSeeds = createIsomorphicFn()
	.server(async (uris: string[]): Promise<SeedView[]> => {
		const { getSeeds } = await import("./seeds.server");
		return (await getSeeds({ uris })).seeds;
	})
	.client(async (uris: string[]): Promise<SeedView[]> => {
		const params = new URLSearchParams();
		for (const uri of uris) params.append("uris", uri);
		const res = await fetch(
			`/xrpc/ink.branchline.getSeeds?${params.toString()}`,
		);
		if (!res.ok) throw new Error(`getSeeds failed: ${res.status}`);
		const data = await res.json();
		return data.seeds;
	});

type Pending = {
	resolve: (seed: SeedView) => void;
	reject: (err: Error) => void;
};

const pending = new Map<string, Pending[]>();
let scheduled = false;

function fetchSeedBatched(uri: string): Promise<SeedView> {
	return new Promise<SeedView>((resolve, reject) => {
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
			const seeds = await fetchSeeds(remaining);
			for (const seed of seeds) {
				const waiters = batch.get(seed.uri);
				if (waiters) {
					for (const w of waiters) w.resolve(seed);
					batch.delete(seed.uri);
				}
			}
			remaining = [...batch.keys()];
			if (seeds.length === 0) break;
		}
		for (const [, waiters] of batch) {
			for (const w of waiters) w.reject(new Error("seed not found"));
		}
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		for (const [, waiters] of batch) {
			for (const w of waiters) w.reject(error);
		}
	}
}

export function seedQuery(uri: string) {
	return queryOptions<SeedView>({
		queryKey: queryKeys.seed(uri),
		queryFn: () => fetchSeedBatched(uri),
		staleTime: 60_000,
	});
}
