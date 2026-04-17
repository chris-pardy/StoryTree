import { prisma } from "#/db";
import type * as ListBlooms from "#/generated/lexicons/types/ink/branchline/listBlooms";
import { Prisma } from "#/generated/prisma/client.js";
import { rankBlooms } from "#/server/blooms/rank";
import { intervalSql } from "#/server/blooms/sql";
import { FOLLOW_WINDOW_HOURS } from "#/server/config";

type BloomRow = {
	uri: string;
	rootUri: string;
	createdAt: Date;
};

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

export async function listBlooms(
	params: ListBlooms.QueryParams,
): Promise<ListBlooms.OutputSchema> {
	const { sort = "recent", cursor } = params;
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

	let bloomRows: BloomRow[];

	if (sort === "pollen") {
		const cursorParsed = cursor ? decodeCursor(cursor) : null;
		const offset = cursorParsed
			? Number.parseInt(cursorParsed.uri, 10) || 0
			: 0;
		const ranked = await rankBlooms({ limit: limit + 1, offset });
		bloomRows = ranked.map((r) => ({
			uri: r.uri,
			rootUri: r.rootUri,
			createdAt: r.createdAt,
		}));
	} else {
		const cursorParsed = cursor ? decodeCursor(cursor) : null;
		if (cursorParsed) {
			bloomRows = await prisma.$queryRaw<BloomRow[]>(Prisma.sql`
        SELECT b.uri, b."rootUri", b."createdAt"
        FROM "Bud" b
        WHERE b."bloomsAt" <= NOW()
          AND (
            b."bloomsAt" > NOW() - ${intervalSql(FOLLOW_WINDOW_HOURS)}
            OR NOT EXISTS (
              SELECT 1 FROM "Bud" c WHERE c."parentUri" = b.uri
            )
          )
          AND (b."createdAt", b.uri) < (${cursorParsed.createdAt}, ${cursorParsed.uri})
        ORDER BY b."createdAt" DESC, b.uri DESC
        LIMIT ${limit + 1}
      `);
		} else {
			bloomRows = await prisma.$queryRaw<BloomRow[]>(Prisma.sql`
        SELECT b.uri, b."rootUri", b."createdAt"
        FROM "Bud" b
        WHERE b."bloomsAt" <= NOW()
          AND (
            b."bloomsAt" > NOW() - ${intervalSql(FOLLOW_WINDOW_HOURS)}
            OR NOT EXISTS (
              SELECT 1 FROM "Bud" c WHERE c."parentUri" = b.uri
            )
          )
        ORDER BY b."createdAt" DESC, b.uri DESC
        LIMIT ${limit + 1}
      `);
		}
	}

	let nextCursor: string | undefined;
	if (bloomRows.length > limit) {
		bloomRows = bloomRows.slice(0, limit);
		const last = bloomRows[bloomRows.length - 1];
		if (sort === "pollen") {
			const cursorParsed = cursor ? decodeCursor(cursor) : null;
			const prevOffset = cursorParsed
				? Number.parseInt(cursorParsed.uri, 10) || 0
				: 0;
			nextCursor = encodeCursor(last.createdAt, String(prevOffset + limit));
		} else {
			nextCursor = encodeCursor(last.createdAt, last.uri);
		}
	}

	const blooms: ListBlooms.BloomView[] = bloomRows.map((row) => ({
		bloom: row.uri,
		root: row.rootUri,
	}));

	return { blooms, cursor: nextCursor };
}
