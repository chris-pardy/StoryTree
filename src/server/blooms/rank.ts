import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client.js";
import { FOLLOW_WINDOW_HOURS, GROWING_WINDOW_HOURS } from "../config";
import { intervalSql, textPreviewSql } from "./sql";

/**
 * Pollen-weighted bloom ranking.
 *
 * Each pollen grain on the bloom or any of its ancestors contributes to the
 * bloom's score with two independent decays:
 *
 *   weight(p) = 0.5^(age_hours(p) / TIME_HALF_LIFE_HOURS)
 *             * 0.5^(depth_offset(p) / DEPTH_HALF_LIFE_LEVELS)
 *
 * - `age_hours(p)` is measured against `Pollen.createdAt`, NOT the bud's
 *   createdAt. Pollinating an old bud produces a fresh, full-weight grain.
 * - `depth_offset(p) = bloom.depth - subject.depth`. Pollen on the bloom
 *   itself has offset 0 (full weight); pollen on an ancestor decays with
 *   the path distance back toward the root, but never to zero — so a long
 *   well-loved lineage still ranks well.
 *
 * Scores are summed across all qualifying pollen, so both "lots of recent
 * grains on the bloom itself" and "steady accumulation deep in the tree"
 * produce strong rankings.
 */
export const TIME_HALF_LIFE_HOURS = 24;
export const DEPTH_HALF_LIFE_LEVELS = 3;

export type RankedBloom = {
	uri: string;
	title: string;
	textPreview: string;
	authorDid: string;
	createdAt: Date;
	rootUri: string;
	rootTitle: string;
	rootAuthor: string;
	pollenCount: number;
	intermediateCount: number;
	budCount: number;
	score: number;
};

type RankedBloomRow = Omit<RankedBloom, "score"> & { score: string | number };

/**
 * Fetch the top N blooms ranked by pollen-weighted score.
 *
 * "Bloom" eligibility matches the listBlooms lexicon: past the 24h
 * growing window, and either still inside the 48h follow window OR
 * never gained a child.
 *
 * Tunables (`timeHalfLifeHours`, `depthHalfLifeLevels`) are passed in so
 * the algorithm can be A/B'd without redeploying. Defaults match the
 * exported constants above.
 *
 * Performance note: the eligible-bloom set is bounded by the 24-48h follow
 * window plus orphan buds with no children. Per-bloom we walk `pathUris`
 * (length = depth + 1, typically small) and join Pollen on each ancestor.
 * If the orphan set grows large enough to matter, add a GIN index on
 * `Bud.pathUris` and revisit.
 */
export async function rankBlooms(opts: {
	limit: number;
	offset?: number;
	timeHalfLifeHours?: number;
	depthHalfLifeLevels?: number;
}): Promise<RankedBloom[]> {
	const {
		limit,
		offset = 0,
		timeHalfLifeHours = TIME_HALF_LIFE_HOURS,
		depthHalfLifeLevels = DEPTH_HALF_LIFE_LEVELS,
	} = opts;

	const rows = await prisma.$queryRaw<RankedBloomRow[]>(Prisma.sql`
    WITH eligible AS (
      SELECT b.uri, b.depth, b."pathUris", b."createdAt",
             b.title, b.text, b."authorDid", b."rootUri"
      FROM "Bud" b
      WHERE b."createdAt" <= NOW() - ${intervalSql(GROWING_WINDOW_HOURS)}
        AND (
          b."createdAt" > NOW() - ${intervalSql(FOLLOW_WINDOW_HOURS)}
          OR NOT EXISTS (
            SELECT 1 FROM "Bud" c WHERE c."parentUri" = b.uri
          )
        )
    ),
    scored AS (
      SELECT
        eb.uri,
        SUM(
          POWER(
            0.5,
            EXTRACT(EPOCH FROM (NOW() - p."createdAt"))
              / 3600.0
              / ${timeHalfLifeHours}::float
          )
          * POWER(
            0.5,
            (eb.depth - sub.depth)::float / ${depthHalfLifeLevels}::float
          )
        ) AS score
      FROM eligible eb
      JOIN "Bud" sub ON sub.uri = ANY(eb."pathUris")
      JOIN "Pollen" p ON p."subjectUri" = sub.uri
      GROUP BY eb.uri
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
      COALESCE(s.score, 0)::float AS score,
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
    LEFT JOIN scored s ON s.uri = eb.uri
    ORDER BY COALESCE(s.score, 0) DESC, eb."createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

	return rows.map((row) => ({
		...row,
		score: typeof row.score === "string" ? parseFloat(row.score) : row.score,
	}));
}
