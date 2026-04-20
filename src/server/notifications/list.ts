import { prisma } from "#/db";
import type * as ListNotifications from "#/generated/lexicons/types/ink/branchline/listNotifications";
import { Prisma } from "#/generated/prisma/client.js";
import { resolveHandles } from "#/server/identity/resolve";

type ContinuationRow = {
	parent_uri: string;
	parent_title: string;
	latest_at: Date;
	actor_count: number;
	actor_dids: string[];
};

export async function listNotifications(params: {
	viewerDid: string;
	seenAt?: Date;
	limit?: number;
}): Promise<ListNotifications.OutputSchema> {
	const { viewerDid } = params;
	const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
	const seenAt = params.seenAt ?? null;

	const sinceFilter = seenAt
		? Prisma.sql`AND c."createdAt" > ${seenAt}`
		: Prisma.empty;

	const rows = await prisma.$queryRaw<ContinuationRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT c."parentUri", c."authorDid", c."createdAt"
      FROM "Bud" c
      INNER JOIN "Bud" p ON p.uri = c."parentUri"
      WHERE p."authorDid" = ${viewerDid}
        AND c."authorDid" IS NOT NULL
        ${sinceFilter}
    ),
    per_parent AS (
      SELECT
        cd."parentUri" AS parent_uri,
        MAX(cd."createdAt") AS latest_at,
        COUNT(DISTINCT cd."authorDid")::int AS actor_count
      FROM candidates cd
      GROUP BY cd."parentUri"
      ORDER BY MAX(cd."createdAt") DESC
      LIMIT ${limit}
    )
    SELECT
      pp.parent_uri,
      p.title AS parent_title,
      pp.latest_at,
      pp.actor_count,
      (
        SELECT COALESCE(array_agg(actor ORDER BY max_at DESC), ARRAY[]::text[])
        FROM (
          SELECT cd2."authorDid" AS actor, MAX(cd2."createdAt") AS max_at
          FROM candidates cd2
          WHERE cd2."parentUri" = pp.parent_uri
          GROUP BY cd2."authorDid"
          ORDER BY MAX(cd2."createdAt") DESC
          LIMIT 10
        ) t
      ) AS actor_dids
    FROM per_parent pp
    INNER JOIN "Bud" p ON p.uri = pp.parent_uri
    ORDER BY pp.latest_at DESC
  `);

	const allActorDids = rows.flatMap((r) => r.actor_dids);
	const handles = await resolveHandles(allActorDids);

	const notifications: ListNotifications.NotificationView[] = rows.map(
		(row) => ({
			kind: "continuation",
			subjectUri: row.parent_uri,
			subjectTitle: row.parent_title,
			latestAt: row.latest_at.toISOString(),
			actorCount: row.actor_count,
			actors: row.actor_dids.map((did) => {
				const actor = handles.get(did);
				return {
					did,
					handle: actor?.handle ?? undefined,
					displayName: actor?.displayName ?? undefined,
				};
			}),
		}),
	);

	return { notifications };
}
