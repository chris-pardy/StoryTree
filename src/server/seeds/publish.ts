import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../../db";
import { getSessionAgent } from "../auth/session";
import { seedCreatePayload } from "../indexer/payload";
import { type SeedRecord, validateSeedCreate } from "../indexer/validate";

// Live record collection — see `lexicons/ink/branchline/seed.json`.
const SEED_COLLECTION = "ink.branchline.seed";

// Mirrors `ink.branchline.publishSeed` input schema. Kept inline (not imported
// from the generated lexicon) to avoid pulling the generated tree into the
// type-check graph; the JSON lexicon remains the source of truth and
// `pnpm lex:gen` still produces client types for external callers.
type InputSchema = {
	grantor: string;
	grantee: string;
	expiresAt?: string;
};

type OutputSchema = {
	uri: string;
	cid: string;
};

/**
 * AppView-side implementation of `ink.branchline.publishSeed`. Contract lives
 * in `lexicons/ink/branchline/publishSeed.json`; input/output types are
 * generated from that file via `pnpm lex:gen`.
 *
 * Gifts a seed: the caller must be the grantee of `grantor`, and publishing
 * chains a new child seed naming `grantee` as its recipient. Root
 * (grantor-less) seeds are intentionally not produced here — only the
 * branchline.ink repo authors those, out-of-band.
 *
 * Flow mirrors `publishBud`:
 * 1. Require a session (`getSessionAgent`).
 * 2. Load the grantor seed + its `child` to compute `hasChild`.
 * 3. `validateSeedCreate` with the same lookup the indexer uses.
 * 4. `agent.com.atproto.repo.createRecord` — PDS assigns the rkey and returns
 *    the real uri/cid.
 * 5. Upsert into Prisma using the shared `seedCreatePayload` so a subsequent
 *    Jetstream replay into `processSeedCreate` is a content-neutral no-op.
 */
export const publishSeed = createServerFn({ method: "POST" })
	.inputValidator((args: InputSchema) => args)
	.handler(async ({ data }): Promise<OutputSchema> => {
		const session = await getSessionAgent(getRequest());
		if (!session) {
			throw new Error("Unauthorized");
		}
		const { agent, did } = session;

		const now = new Date();
		const grantor = await prisma.seed.findUnique({
			where: { uri: data.grantor },
			include: { child: { select: { uri: true } } },
		});

		const record: SeedRecord = {
			grantee: data.grantee,
			grantor: data.grantor,
			expiresAt: data.expiresAt,
			createdAt: now.toISOString(),
		};

		const check = validateSeedCreate({
			record,
			authorDid: did,
			grantor: grantor
				? {
						uri: grantor.uri,
						granteeDid: grantor.granteeDid,
						chainUris: grantor.chainUris,
						expiresAt: grantor.expiresAt,
						hasChild: grantor.child !== null,
					}
				: null,
			// publishSeed never creates root seeds — those come from a
			// separately-gated admin path.
			isAllowedRoot: false,
			now,
		});
		if (!check.ok) {
			throw new Error(rejectionToErrorName(check.reason));
		}

		const pdsResp = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: SEED_COLLECTION,
			record: { $type: SEED_COLLECTION, ...record },
			validate: false,
		});
		const { uri, cid } = pdsResp.data;

		// `grantor` is guaranteed non-null when validateSeedCreate succeeds with
		// `isAllowedRoot: false` (otherwise it would have returned `root-not-allowed`
		// or `grantor-not-found`), so this assertion is safe.
		if (!grantor) {
			throw new Error("publishSeed: grantor null after ok validation");
		}

		await prisma.seed.upsert({
			where: { uri },
			create: seedCreatePayload({
				record,
				uri,
				cid,
				authorDid: did,
				grantor: { uri: grantor.uri, chainUris: grantor.chainUris },
			}),
			update: {},
		});

		return { uri, cid };
	});

function rejectionToErrorName(reason: string): string {
	switch (reason) {
		case "grantor-not-found":
			return "GrantorNotFound";
		case "not-grantee":
			return "NotGrantee";
		case "grantor-expired":
			return "GrantorExpired";
		case "grantor-already-granted":
			return "GrantorAlreadyGranted";
		case "root-not-allowed":
			return "GrantorNotFound";
		default:
			return reason;
	}
}
