import { prisma } from "#/db";
import type * as GetBuds from "#/generated/lexicons/types/ink/branchline/getBuds";
import { Prisma } from "#/generated/prisma/client.js";
import { resolveHandles } from "#/server/identity/resolve";

type BudRow = {
	uri: string;
	cid: string;
	authorDid: string;
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
	viewerPollinated: boolean;
};

function rowToBudView(
	row: BudRow,
	handles: ReadonlyMap<
		string,
		{ handle: string | null; displayName: string | null }
	>,
): GetBuds.BudView {
	const actor = handles.get(row.authorDid);
	return {
		uri: row.uri,
		cid: row.cid,
		author: {
			did: row.authorDid,
			handle: actor?.handle ?? row.authorDid,
			displayName: actor?.displayName ?? undefined,
		},
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
		viewerPollinated: row.viewerPollinated || undefined,
		formatting: row.formatting as GetBuds.BudView["formatting"],
	};
}

export async function getBuds(
	params: GetBuds.QueryParams,
	viewerDid?: string | null,
): Promise<GetBuds.OutputSchema> {
	if (params.uris.length === 0) return { buds: [] };
	if (params.uris.length > 25) throw new Error("Maximum 25 URIs per request");
	const buds = await hydrateBuds(params.uris, viewerDid);
	return { buds };
}

export async function hydrateBuds(
	uris: string[],
	viewerDid?: string | null,
): Promise<GetBuds.BudView[]> {
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
      ) AS children,
      ${
				viewerDid
					? Prisma.sql`EXISTS(
        SELECT 1 FROM "Pollen" vp
        WHERE vp."subjectUri" = b.uri AND vp."authorDid" = ${viewerDid}
      )`
					: Prisma.sql`false`
			} AS "viewerPollinated"
    FROM "Bud" b
    WHERE b.uri = ANY(${uris})
  `);

	const rowsByUri = new Map(rows.map((r) => [r.uri, r]));
	const handles = await resolveHandles(rows.map((r) => r.authorDid));

	const buds: GetBuds.BudView[] = [];
	for (const uri of uris) {
		const row = rowsByUri.get(uri);
		if (!row) continue;
		buds.push(rowToBudView(row, handles));
	}
	return buds;
}
