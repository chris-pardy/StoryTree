import { createServerFn } from "@tanstack/react-start";
import type * as ListBlooms from "../../generated/lexicons/types/ink/branchline/listBlooms";

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

/**
 * Home-feed bloom listing. Mirrors `ink.branchline.listBlooms` — eligibility
 * is `bloomsAt <= NOW()`, still in the follow window or childless.
 *
 * `sort: 'pollen'` delegates to the decay-weighted ranker in `./rank`.
 * `sort: 'recent'` is a cheap `ORDER BY createdAt DESC` over the same
 * eligible set.
 */
export async function listBloomsHandler(args: {
	limit?: number;
	sort?: "recent" | "pollen";
	cursor?: string;
}): Promise<ListBlooms.OutputSchema> {
	// Dynamic imports keep prisma/pg out of the client bundle.
	const { prisma } = await import("../../db");
	const { Prisma } = await import("../../generated/prisma/client.js");
	const { FOLLOW_WINDOW_HOURS } = await import("../config");
	const { rankBlooms } = await import("./rank");
	const { intervalSql } = await import("./sql");

	const { sort = "recent", cursor } = args;
	const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);

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

export const listBlooms = createServerFn({ method: "GET" })
	.inputValidator(
		(args: { limit?: number; sort?: "recent" | "pollen"; cursor?: string }) =>
			args ?? {},
	)
	.handler(async ({ data }) => listBloomsHandler(data));
