import { prisma } from "#/db";
import type * as GetSeeds from "#/generated/lexicons/types/ink/branchline/getSeeds";
import { resolveHandles } from "#/server/identity/resolve";

type HandleInfo = { handle: string | null; displayName: string | null };

function authorView(
	did: string,
	handles: ReadonlyMap<string, HandleInfo>,
): GetSeeds.AuthorView {
	const actor = handles.get(did);
	return {
		did,
		handle: actor?.handle ?? did,
		displayName: actor?.displayName ?? undefined,
	};
}

export async function getSeeds(
	params: GetSeeds.QueryParams,
): Promise<GetSeeds.OutputSchema> {
	if (params.uris.length === 0) return { seeds: [] };
	if (params.uris.length > 25) throw new Error("Maximum 25 URIs per request");

	const inputRows = await prisma.seed.findMany({
		where: { uri: { in: params.uris } },
	});

	// Gather every ancestor referenced by any input's chainUris so we can
	// compute each input's chain-wide earliest expiresAt in a single follow-up
	// query.
	const ancestorUris = new Set<string>();
	for (const row of inputRows) {
		for (const u of row.chainUris) ancestorUris.add(u);
	}
	const chainRows =
		ancestorUris.size === 0
			? []
			: await prisma.seed.findMany({
					where: { uri: { in: [...ancestorUris] } },
					select: { uri: true, expiresAt: true },
				});
	const expiryByUri = new Map(
		chainRows.map((r) => [r.uri, r.expiresAt] as const),
	);

	const dids = new Set<string>();
	for (const row of inputRows) {
		dids.add(row.authorDid);
		dids.add(row.granteeDid);
	}
	const handles = await resolveHandles([...dids]);

	const inputsByUri = new Map(inputRows.map((r) => [r.uri, r] as const));
	const seeds: GetSeeds.SeedView[] = [];
	for (const uri of params.uris) {
		const row = inputsByUri.get(uri);
		if (!row) continue;

		let chainMinExpiry: Date | null = null;
		for (const chainUri of row.chainUris) {
			const exp = expiryByUri.get(chainUri);
			if (!exp) continue;
			if (chainMinExpiry === null || exp.getTime() < chainMinExpiry.getTime()) {
				chainMinExpiry = exp;
			}
		}

		seeds.push({
			uri: row.uri,
			cid: row.cid,
			grantee: authorView(row.granteeDid, handles),
			grantedBy: authorView(row.authorDid, handles),
			expiresAt: chainMinExpiry?.toISOString(),
			createdAt: row.createdAt.toISOString(),
		});
	}

	return { seeds };
}
