export const queryKeys = {
	bud: (uri: string) => ["bud", uri] as const,
	seed: (uri: string) => ["seed", uri] as const,
	branch: (uri: string) => ["branch", uri] as const,
	blooms: (sort: string, limit: number) => ["blooms", { sort, limit }] as const,
	authorBuds: (actor: string, limit: number) =>
		["authorBuds", { actor, limit }] as const,
	authorSeeds: (actor: string, limit: number) =>
		["authorSeeds", { actor, limit }] as const,
	authorPlantings: (actor: string, limit: number) =>
		["authorPlantings", { actor, limit }] as const,
	profilePermissions: (did: string) => ["profilePermissions", did] as const,
};
