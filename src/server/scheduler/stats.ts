import type { PrismaClient } from "../../generated/prisma/client.js";

export type DailyStats = {
	seedsPlanted: number;
	storiesBloomed: number;
	pollenCount: number;
	newAuthors: number;
};

export type DailyStatsDeps = {
	prisma: Pick<PrismaClient, "seed" | "bud" | "pollen" | "$queryRaw">;
};

// Counts activity across the window `[start, end)`. Written as four independent
// awaits (not a transaction) since the numbers are posted to Bluesky for a
// casual daily update — a row arriving mid-read just ends up in tomorrow's post.
export async function collectDailyStats(
	deps: DailyStatsDeps,
	window: { start: Date; end: Date },
): Promise<DailyStats> {
	const { prisma } = deps;
	const { start, end } = window;

	const [seedsPlanted, storiesBloomed, pollenCount, newAuthors] =
		await Promise.all([
			prisma.seed.count({
				where: { createdAt: { gte: start, lt: end } },
			}),
			// A bud's `bloomsAt` is `createdAt + 24h`, so buds that transitioned
			// from bud to bloom during the window are exactly those whose
			// bloomsAt falls inside it.
			prisma.bud.count({
				where: { bloomsAt: { gte: start, lt: end } },
			}),
			prisma.pollen.count({
				where: { createdAt: { gte: start, lt: end } },
			}),
			countNewAuthors(prisma, start, end),
		]);

	return { seedsPlanted, storiesBloomed, pollenCount, newAuthors };
}

// A "new author" is a DID whose very first bud landed inside the window. We
// can't express "first ever" cleanly in the Prisma query builder, so drop to
// SQL: group by author, filter to groups whose min(createdAt) is in range.
async function countNewAuthors(
	prisma: DailyStatsDeps["prisma"],
	start: Date,
	end: Date,
): Promise<number> {
	const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
		SELECT COUNT(*)::bigint AS count FROM (
			SELECT "authorDid"
			FROM "Bud"
			WHERE "authorDid" IS NOT NULL
			GROUP BY "authorDid"
			HAVING MIN("createdAt") >= ${start} AND MIN("createdAt") < ${end}
		) AS firsts
	`;
	const count = rows[0]?.count ?? 0n;
	return Number(count);
}
