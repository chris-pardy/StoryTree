import { createServerFn } from "@tanstack/react-start";
import type { Bloom } from "../../components/BloomCard";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client.js";
import { resolveHandles } from "../identity/resolve";
import { type BloomRow, toBloom } from "./shape";
import { textPreviewSql } from "./sql";

/**
 * Author-profile bloom listing. Returns the same enriched Bloom shape as
 * the home feed, filtered to buds authored by `actor` where the author has
 * no deeper descendant in the same branch (collapses back-and-forth to the
 * author's terminal contribution per chain).
 */
export const listAuthorBlooms = createServerFn({ method: "GET" })
	.inputValidator((args: { actor: string; limit?: number }) => args)
	.handler(async ({ data }): Promise<Bloom[]> => {
		const { actor, limit = 50 } = data;
		const rows = await prisma.$queryRaw<BloomRow[]>(Prisma.sql`
      SELECT
        b.uri,
        b.title,
        ${textPreviewSql("b.text")} AS "textPreview",
        b."authorDid",
        b."createdAt",
        b."rootUri",
        r.title AS "rootTitle",
        r."authorDid" AS "rootAuthor",
        (
          SELECT COUNT(*)::int FROM "Pollen" p
          WHERE p."subjectUri" = b.uri
        ) AS "pollenCount",
        (
          SELECT COUNT(DISTINCT path."authorDid")::int
          FROM "Bud" path
          WHERE path.uri = ANY(b."pathUris")
            AND path."authorDid" <> b."authorDid"
            AND path."authorDid" <> r."authorDid"
        ) AS "intermediateCount",
        (
          SELECT COUNT(*)::int FROM "Bud" c
          WHERE c."parentUri" = b.uri
        ) AS "budCount"
      FROM "Bud" b
      INNER JOIN "Bud" r ON r.uri = b."rootUri"
      WHERE b."authorDid" = ${actor}
        AND NOT EXISTS (
          SELECT 1 FROM "Bud" d
          WHERE d."authorDid" = ${actor}
            AND d.uri <> b.uri
            AND b.uri = ANY(d."pathUris")
        )
      ORDER BY b."createdAt" DESC
      LIMIT ${limit}
    `);
		const handles = await resolveHandles(
			rows.flatMap((r) => [r.authorDid, r.rootAuthor]),
		);
		return rows.map((row) => toBloom(row, handles));
	});
