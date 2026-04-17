import { prisma } from "#/db";
import type * as ListAuthorPlantings from "#/generated/lexicons/types/ink/branchline/listAuthorPlantings";
import { Prisma } from "#/generated/prisma/client.js";

function encodeCursor(createdAt: Date, uri: string): string {
	return `${createdAt.toISOString()}::${uri}`;
}

function decodeCursor(cursor: string): { createdAt: Date; uri: string } | null {
	const idx = cursor.indexOf("::");
	if (idx === -1) return null;
	const ts = cursor.slice(0, idx);
	const uri = cursor.slice(idx + 2);
	const createdAt = new Date(ts);
	if (Number.isNaN(createdAt.getTime()) || !uri) return null;
	return { createdAt, uri };
}

export async function listAuthorPlantings(
	params: ListAuthorPlantings.QueryParams,
): Promise<ListAuthorPlantings.OutputSchema> {
	const { actor, cursor } = params;
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
	const cursorParsed = cursor ? decodeCursor(cursor) : null;

	type Row = { uri: string; createdAt: Date; treeHeight: number };
	let rows: Row[];

	if (cursorParsed) {
		rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        b.uri,
        b."createdAt",
        COALESCE(
          (SELECT MAX(cardinality(d."pathUris"))
             FROM "Bud" d
             WHERE d."rootUri" = b.uri),
          1
        )::int AS "treeHeight"
      FROM "Bud" b
      WHERE b."authorDid" = ${actor}
        AND b."parentUri" IS NULL
        AND (b."createdAt", b.uri) < (${cursorParsed.createdAt}, ${cursorParsed.uri})
      ORDER BY b."createdAt" DESC, b.uri DESC
      LIMIT ${limit + 1}
    `);
	} else {
		rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        b.uri,
        b."createdAt",
        COALESCE(
          (SELECT MAX(cardinality(d."pathUris"))
             FROM "Bud" d
             WHERE d."rootUri" = b.uri),
          1
        )::int AS "treeHeight"
      FROM "Bud" b
      WHERE b."authorDid" = ${actor}
        AND b."parentUri" IS NULL
      ORDER BY b."createdAt" DESC, b.uri DESC
      LIMIT ${limit + 1}
    `);
	}

	let nextCursor: string | undefined;
	if (rows.length > limit) {
		rows = rows.slice(0, limit);
		const last = rows[rows.length - 1];
		nextCursor = encodeCursor(last.createdAt, last.uri);
	}

	return {
		plantings: rows.map((r) => ({ root: r.uri, treeHeight: r.treeHeight })),
		cursor: nextCursor,
	};
}
