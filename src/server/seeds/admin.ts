import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../../db";
import { getSessionAgent } from "../auth/session";
import { seedCreatePayload } from "../indexer/payload";
import type { SeedRecord } from "../indexer/validate";
import { hasPermission } from "../permissions";

const SEED_COLLECTION = "ink.branchline.seed";

type GrantRootSeedInput = {
	grantee: string;
	expiresAt?: string;
};

type GrantRootSeedOutput = {
	uri: string;
	cid: string;
};

/**
 * Grants a root seed (no grantor) to a grantee. Only callable by DIDs
 * with the `canGrantSeeds` permission.
 */
export const grantRootSeed = createServerFn({ method: "POST" })
	.inputValidator((args: GrantRootSeedInput) => args)
	.handler(async ({ data }): Promise<GrantRootSeedOutput> => {
		const session = await getSessionAgent(getRequest());
		if (!session) {
			throw new Error("Unauthorized");
		}
		const { agent, did } = session;

		if (!(await hasPermission(did, "canGrantSeeds"))) {
			throw new Error("Forbidden");
		}

		const now = new Date();
		const record: SeedRecord = {
			grantee: data.grantee,
			expiresAt: data.expiresAt,
			createdAt: now.toISOString(),
		};

		const pdsResp = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: SEED_COLLECTION,
			record: { $type: SEED_COLLECTION, ...record },
			validate: false,
		});
		const { uri, cid } = pdsResp.data;

		await prisma.seed.upsert({
			where: { uri },
			create: seedCreatePayload({
				record,
				uri,
				cid,
				authorDid: did,
				grantor: null,
			}),
			update: {},
		});

		return { uri, cid };
	});
