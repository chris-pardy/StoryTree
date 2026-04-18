import { prisma } from "../../db";
import type * as GetBuds from "../../generated/lexicons/types/ink/branchline/getBuds";
import { Prisma } from "../../generated/prisma/client.js";
import { resolveHandles } from "../identity/resolve";

type BudRow = {
	uri: string;
	cid: string;
	authorDid: string | null;
	parentUri: string | null;
	parentCid: string | null;
	title: string;
	text: string;
	formatting: unknown;
	createdAt: Date;
	bloomsAt: Date;
	locked: boolean;
	depth: number;
	pollenCount: number;
	intermediateCount: number;
	children: string[];
};

function rowToBudView(
	row: BudRow,
	handles: ReadonlyMap<
		string,
		{ handle: string | null; displayName: string | null }
	>,
): GetBuds.BudView {
	const actor = row.authorDid ? handles.get(row.authorDid) : undefined;
	return {
		uri: row.uri,
		cid: row.cid,
		author: row.authorDid
			? {
					did: row.authorDid,
					handle: actor?.handle ?? row.authorDid,
					displayName: actor?.displayName ?? undefined,
				}
			: undefined,
		title: row.title,
		text: row.text,
		parent: row.parentUri
			? { uri: row.parentUri, cid: row.parentCid as string }
			: undefined,
		createdAt: row.createdAt.toISOString(),
		depth: row.depth,
		pollenCount: row.pollenCount,
		intermediateCount: row.intermediateCount,
		children: row.children.length > 0 ? row.children : undefined,
		growing: row.bloomsAt.getTime() > Date.now(),
		locked: row.locked,
		formatting: row.formatting as GetBuds.BudView["formatting"],
	};
}

/**
 * Hydrate a set of bud URIs into full BudView objects. Returns views
 * in the same order as the input URIs; unknown URIs are silently omitted.
 */
export async function hydrateBuds(uris: string[]): Promise<GetBuds.BudView[]> {
	if (uris.length === 0) return [];

	const rows = await prisma.$queryRaw<Array<BudRow>>(Prisma.sql`
    SELECT
      b.uri,
      b.cid,
      b."authorDid",
      b."parentUri",
      b."parentCid",
      b.title,
      b.text,
      b.formatting,
      b."createdAt",
      b."bloomsAt",
      b.locked,
      b.depth,
      COALESCE(
        (SELECT COUNT(*)::int FROM "Pollen" p WHERE p."subjectUri" = b.uri),
        0
      ) AS "pollenCount",
      (
        SELECT COUNT(DISTINCT sub."authorDid")::int
        FROM unnest(b."pathUris") AS u(path_uri)
        INNER JOIN "Bud" sub ON sub.uri = u.path_uri
      ) AS "intermediateCount",
      COALESCE(
        ARRAY(SELECT c.uri FROM "Bud" c WHERE c."parentUri" = b.uri ORDER BY c."createdAt" ASC),
        ARRAY[]::text[]
      ) AS children
    FROM "Bud" b
    WHERE b.uri = ANY(${uris})
  `);

	const rowsByUri = new Map(rows.map((r) => [r.uri, r]));
	const handles = await resolveHandles(
		rows.flatMap((r) => (r.authorDid ? [r.authorDid] : [])),
	);

	const buds: GetBuds.BudView[] = [];
	for (const uri of uris) {
		const row = rowsByUri.get(uri);
		if (!row) continue;
		buds.push(rowToBudView(row, handles));
	}
	return buds;
}
