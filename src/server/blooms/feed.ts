import { createServerFn } from "@tanstack/react-start";
import type { Bloom } from "../../components/BloomCard";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client.js";
import { FOLLOW_WINDOW_HOURS, GROWING_WINDOW_HOURS } from "../config";
import { resolveHandles } from "../identity/resolve";
import { rankBlooms } from "./rank";
import { type BloomRow, toBloom } from "./shape";
import { intervalSql, textPreviewSql } from "./sql";

/**
 * Home-feed bloom listing. Mirrors `ink.branchline.listBlooms` — eligibility
 * is "past 24h growing window, still in the 48h follow window or childless".
 *
 * `sort: 'pollen'` delegates to the decay-weighted ranker in `./rank`.
 * `sort: 'recent'` is a cheap `ORDER BY createdAt DESC` over the same
 * eligible set.
 */
export const listBlooms = createServerFn({ method: "GET" })
	.inputValidator(
		(args: { limit?: number; sort?: "recent" | "pollen" }) => args ?? {},
	)
	.handler(async ({ data }): Promise<Bloom[]> => {
		const { limit = 20, sort = "recent" } = data;
		if (sort === "pollen") {
			const ranked = await rankBlooms({ limit });
			const handles = await resolveHandles(
				ranked.flatMap((r) => [r.authorDid, r.rootAuthor]),
			);
			return ranked.map((r) => toBloom(r, handles));
		}
		const rows = await prisma.$queryRaw<BloomRow[]>(Prisma.sql`
      WITH eligible AS (
        SELECT b.uri, b.depth, b."createdAt",
               b.title, b.text, b."authorDid", b."rootUri", b."pathUris"
        FROM "Bud" b
        WHERE b."createdAt" <= NOW() - ${intervalSql(GROWING_WINDOW_HOURS)}
          AND (
            b."createdAt" > NOW() - ${intervalSql(FOLLOW_WINDOW_HOURS)}
            OR NOT EXISTS (
              SELECT 1 FROM "Bud" c WHERE c."parentUri" = b.uri
            )
          )
      )
      SELECT
        eb.uri,
        eb.title,
        ${textPreviewSql("eb.text")} AS "textPreview",
        eb."authorDid",
        eb."createdAt",
        eb."rootUri",
        r.title AS "rootTitle",
        r."authorDid" AS "rootAuthor",
        (
          SELECT COUNT(*)::int FROM "Pollen" p
          WHERE p."subjectUri" = eb.uri
        ) AS "pollenCount",
        (
          SELECT COUNT(DISTINCT path."authorDid")::int
          FROM "Bud" path
          WHERE path.uri = ANY(eb."pathUris")
            AND path."authorDid" <> eb."authorDid"
            AND path."authorDid" <> r."authorDid"
        ) AS "intermediateCount",
        (
          SELECT COUNT(*)::int FROM "Bud" c
          WHERE c."parentUri" = eb.uri
        ) AS "budCount"
      FROM eligible eb
      INNER JOIN "Bud" r ON r.uri = eb."rootUri"
      ORDER BY eb."createdAt" DESC
      LIMIT ${limit}
    `);
		const handles = await resolveHandles(
			rows.flatMap((r) => [r.authorDid, r.rootAuthor]),
		);
		return rows.map((r) => toBloom(r, handles));
	});
