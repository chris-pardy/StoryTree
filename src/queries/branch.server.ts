import { prisma } from "#/db";
import type * as GetBranch from "#/generated/lexicons/types/ink/branchline/getBranch";
import { Prisma } from "#/generated/prisma/client.js";

export async function getBranch(
	params: GetBranch.QueryParams,
): Promise<GetBranch.OutputSchema> {
	const rows = await prisma.$queryRaw<Array<{ uri: string }>>(Prisma.sql`
    SELECT u.path_uri AS uri
    FROM "Bud" b, unnest(b."pathUris") WITH ORDINALITY AS u(path_uri, ord)
    WHERE b.uri = ${params.bud}
    ORDER BY u.ord
  `);
	return { buds: rows.map((r) => r.uri) };
}
