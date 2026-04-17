import { createServerFn } from "@tanstack/react-start";
import type * as GetBranch from "../../generated/lexicons/types/ink/branchline/getBranch";

export async function getBranchHandler(args: {
	bud: string;
}): Promise<GetBranch.OutputSchema> {
	const { prisma } = await import("../../db");
	const { Prisma } = await import("../../generated/prisma/client.js");

	const rows = await prisma.$queryRaw<Array<{ uri: string }>>(Prisma.sql`
    SELECT u.path_uri AS uri
    FROM "Bud" b, unnest(b."pathUris") WITH ORDINALITY AS u(path_uri, ord)
    WHERE b.uri = ${args.bud}
    ORDER BY u.ord
  `);

	return { buds: rows.map((r) => r.uri) };
}

export const getBranch = createServerFn({ method: "GET" })
	.inputValidator((args: { bud: string }) => args)
	.handler(async ({ data }) => getBranchHandler(data));
