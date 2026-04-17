import { prisma } from "#/db";
import type * as ListAuthorBuds from "#/generated/lexicons/types/ink/branchline/listAuthorBuds";
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

export async function listAuthorBuds(
	params: ListAuthorBuds.QueryParams,
): Promise<ListAuthorBuds.OutputSchema> {
	const { actor, cursor } = params;
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
	const cursorParsed = cursor ? decodeCursor(cursor) : null;

	type Row = { uri: string; rootUri: string; createdAt: Date };
	let rows: Row[];

	if (cursorParsed) {
		rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT b.uri, b."rootUri", b."createdAt"
      FROM "Bud" b
      WHERE b."authorDid" = ${actor}
        AND NOT EXISTS (
          SELECT 1 FROM "Bud" d
          WHERE d."authorDid" = ${actor}
            AND d.uri <> b.uri
            AND b.uri = ANY(d."pathUris")
        )
        AND (b."createdAt", b.uri) < (${cursorParsed.createdAt}, ${cursorParsed.uri})
      ORDER BY b."createdAt" DESC, b.uri DESC
      LIMIT ${limit + 1}
    `);
	} else {
		rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT b.uri, b."rootUri", b."createdAt"
      FROM "Bud" b
      WHERE b."authorDid" = ${actor}
        AND NOT EXISTS (
          SELECT 1 FROM "Bud" d
          WHERE d."authorDid" = ${actor}
            AND d.uri <> b.uri
            AND b.uri = ANY(d."pathUris")
        )
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
		buds: rows.map((r) => ({ bloom: r.uri, root: r.rootUri })),
		cursor: nextCursor,
	};
}
