import { createServerFn } from "@tanstack/react-start";
import type * as ListAuthorBuds from "../../generated/lexicons/types/ink/branchline/listAuthorBuds";

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
 * Author-profile bud listing. Returns budViews for buds authored by `actor`
 * where the author has no deeper descendant in the same branch (collapses
 * back-and-forth to the author's terminal contribution per chain).
 */
export async function listAuthorBudsHandler(args: {
	actor: string;
	limit?: number;
	cursor?: string;
}): Promise<ListAuthorBuds.OutputSchema> {
	const { prisma } = await import("../../db");
	const { Prisma } = await import("../../generated/prisma/client.js");

	const { actor, cursor } = args;
	const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
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

export const listAuthorBuds = createServerFn({ method: "GET" })
	.inputValidator(
		(args: { actor: string; limit?: number; cursor?: string }) => args,
	)
	.handler(async ({ data }) => listAuthorBudsHandler(data));

/** @deprecated Use {@link listAuthorBuds}. */
export const listAuthorBlooms = listAuthorBuds;
