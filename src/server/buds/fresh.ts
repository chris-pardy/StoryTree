import { createServerFn } from "@tanstack/react-start";
import type { Bud } from "../../components/BudCard";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client.js";
import { type ResolvedActor, resolveHandles } from "../identity/resolve";

type FreshRow = {
	uri: string;
	title: string;
	authorDid: string | null;
	createdAt: Date;
	pollenCount: number;
};

function toBud(
	row: FreshRow,
	handles: ReadonlyMap<string, ResolvedActor>,
): Bud {
	const actor = row.authorDid ? handles.get(row.authorDid) : undefined;
	return {
		uri: row.uri,
		title: row.title,
		author: row.authorDid,
		authorHandle: actor?.handle ?? undefined,
		authorDisplayName: actor?.displayName ?? undefined,
		createdAt: row.createdAt.toISOString(),
		pollenCount: row.pollenCount,
	};
}

/**
 * Buds descended from `ancestorUri` that are still growing (bloomsAt in
 * the future). Uses the packed `pathUris` array so descendants at any
 * depth match with a single indexed scan, no recursive CTE.
 */
export const listFreshBuds = createServerFn({ method: "GET" })
	.inputValidator(
		(args: { ancestorUri: string; limit?: number; excludeUri?: string }) =>
			args,
	)
	.handler(async ({ data }): Promise<Bud[]> => {
		const { ancestorUri, limit = 12, excludeUri } = data;
		// Always exclude the ancestor (it's the root of the tree and not "fresh"
		// in the interesting sense). Optionally exclude a second URI — used by
		// leaf routes so the bud you're currently reading doesn't appear in the
		// "fresh on this tree" rail under its own content.
		const excludeClause = excludeUri
			? Prisma.sql`AND b.uri <> ${excludeUri}`
			: Prisma.empty;
		const rows = await prisma.$queryRaw<FreshRow[]>(Prisma.sql`
      SELECT
        b.uri,
        b.title,
        b."authorDid",
        b."createdAt",
        (
          SELECT COUNT(*)::int FROM "Pollen" p
          WHERE p."subjectUri" = b.uri
        ) AS "pollenCount"
      FROM "Bud" b
      WHERE ${ancestorUri} = ANY(b."pathUris")
        AND b.uri <> ${ancestorUri}
        ${excludeClause}
        AND b."bloomsAt" > NOW()
        AND b."authorDid" IS NOT NULL
      ORDER BY b."createdAt" DESC
      LIMIT ${limit}
    `);
		const handles = await resolveHandles(
			rows.flatMap((r) => (r.authorDid ? [r.authorDid] : [])),
		);
		return rows.map((r) => toBud(r, handles));
	});
