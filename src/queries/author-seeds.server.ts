import { prisma } from "#/db";
import type * as ListAuthorSeeds from "#/generated/lexicons/types/ink/branchline/listAuthorSeeds";
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

/**
 * Fast, listing-side validity check: actor is the seed's grantee, the seed
 * hasn't self-expired, it hasn't been planted, and it doesn't have an
 * active (non-expired) sub-grant below it. The expensive full-chain
 * validation — walking every ancestor to verify custody hops and non-expiry
 * — is deferred to plant time (processBudCreate / resolveBudParent).
 */
export async function listAuthorSeeds(
	params: ListAuthorSeeds.QueryParams,
): Promise<ListAuthorSeeds.OutputSchema> {
	const { actor, cursor } = params;
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
	const cursorParsed = cursor ? decodeCursor(cursor) : null;
	const now = new Date();

	type UriRow = { uri: string; createdAt: Date };
	let rows: UriRow[];

	if (cursorParsed) {
		rows = await prisma.$queryRaw<UriRow[]>(Prisma.sql`
      SELECT s.uri, s."createdAt"
      FROM "Seed" s
      WHERE s."granteeDid" = ${actor}
        AND (s."expiresAt" IS NULL OR s."expiresAt" > ${now})
        AND NOT EXISTS (
          SELECT 1 FROM "Seed" c
          WHERE c."grantorUri" = s.uri
            AND (c."expiresAt" IS NULL OR c."expiresAt" > ${now})
        )
        AND NOT EXISTS (
          SELECT 1 FROM "Bud" b
          WHERE b."seedUri" = s.uri AND b."parentUri" IS NULL
        )
        AND (s."createdAt", s.uri) < (${cursorParsed.createdAt}, ${cursorParsed.uri})
      ORDER BY s."createdAt" DESC, s.uri DESC
      LIMIT ${limit + 1}
    `);
	} else {
		rows = await prisma.$queryRaw<UriRow[]>(Prisma.sql`
      SELECT s.uri, s."createdAt"
      FROM "Seed" s
      WHERE s."granteeDid" = ${actor}
        AND (s."expiresAt" IS NULL OR s."expiresAt" > ${now})
        AND NOT EXISTS (
          SELECT 1 FROM "Seed" c
          WHERE c."grantorUri" = s.uri
            AND (c."expiresAt" IS NULL OR c."expiresAt" > ${now})
        )
        AND NOT EXISTS (
          SELECT 1 FROM "Bud" b
          WHERE b."seedUri" = s.uri AND b."parentUri" IS NULL
        )
      ORDER BY s."createdAt" DESC, s.uri DESC
      LIMIT ${limit + 1}
    `);
	}

	let nextCursor: string | undefined;
	if (rows.length > limit) {
		rows = rows.slice(0, limit);
		const last = rows[rows.length - 1];
		nextCursor = encodeCursor(last.createdAt, last.uri);
	}

	return { seeds: rows.map((r) => r.uri), cursor: nextCursor };
}
