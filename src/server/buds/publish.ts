import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../../db";
import { getSessionAgent } from "../auth/session";
import { budCreatePayload } from "../indexer/payload";
import { resolveBudParent, resolvedParentToLookup } from "../indexer/process";
import {
	type BudRecord,
	type FormatSpan,
	validateBudCreate,
} from "../indexer/validate";
import { announcePlantToCentralBsky } from "./announce";

// Live record collection — see `lexicons/ink/branchline/bud.json`.
const BUD_COLLECTION = "ink.branchline.bud";

// Mirrors `ink.branchline.publishBud` input schema. Kept inline (not imported
// from the generated lexicon) to avoid pulling the generated tree into the
// type-check graph; the JSON lexicon remains the source of truth and
// `pnpm lex:gen` still produces client types for external callers.
type InputSchema = {
	parentUri: string;
	title: string;
	text: string;
	formatting?: Array<FormatSpan>;
};

type OutputSchema = {
	uri: string;
	cid: string;
};

/**
 * AppView-side implementation of `ink.branchline.publishBud`. Contract lives in
 * `lexicons/ink/branchline/publishBud.json`; input/output types are generated
 * from that file via `pnpm lex:gen`.
 *
 * Parents may be another bud (continuation) or a seed (planting a root bud).
 * Parent resolution and validation reuse the Jetstream indexer's logic so the
 * publish path and the replay path can never diverge.
 *
 * Flow:
 * 1. Require a session (`getSessionAgent`).
 * 2. `resolveBudParent` — look up either a bud or a seed, with the same
 *    chain/planted checks the indexer runs.
 * 3. `validateBudCreate` against the resolved parent.
 * 4. `agent.com.atproto.repo.createRecord` — PDS assigns the rkey and returns
 *    the real uri/cid.
 * 5. Upsert into Prisma using the shared `budCreatePayload` so a subsequent
 *    Jetstream replay into `processBudCreate` is a content-neutral no-op.
 */
export const publishBud = createServerFn({ method: "POST" })
	.inputValidator((args: InputSchema) => args)
	.handler(async ({ data }): Promise<OutputSchema> => {
		const session = await getSessionAgent(getRequest());
		if (!session) {
			throw new Error("Unauthorized");
		}
		const { agent, did } = session;

		const now = new Date();
		const parent = await resolveBudParent(prisma, data.parentUri, now);
		if (!parent) {
			throw new Error("ParentNotFound");
		}

		const record: BudRecord = {
			title: data.title.trim() || "Untitled",
			text: data.text,
			parent: { uri: parent.uri, cid: parent.cid },
			createdAt: now.toISOString(),
			formatting:
				data.formatting && data.formatting.length > 0
					? data.formatting
					: undefined,
		};

		const check = validateBudCreate({
			record,
			authorDid: did,
			parent: resolvedParentToLookup(parent),
			now,
		});
		if (!check.ok) {
			throw new Error(rejectionToErrorName(check.reason));
		}

		const pdsResp = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: BUD_COLLECTION,
			record: { $type: BUD_COLLECTION, ...record },
			validate: false,
		});
		const { uri, cid } = pdsResp.data;

		// `upsert` + `update: {}` returns the existing row unchanged when the
		// Jetstream indexer has already landed this bud (rare — PDS commits
		// propagate to us before they reach Jetstream, but the race exists).
		// Compare `indexedAt` to detect the insert: the default `@default(now())`
		// fires only on the create branch, so a freshly-inserted row has
		// `indexedAt` ~= now. An existing row carries a much older value.
		const row = await prisma.bud.upsert({
			where: { uri },
			create: budCreatePayload({
				record,
				uri,
				cid,
				authorDid: did,
				parent,
			}),
			update: {},
			select: { indexedAt: true },
		});
		const inserted = Date.now() - row.indexedAt.getTime() < 5_000;

		// Planting event: the bud's parent is a seed. Fire the central bsky
		// announce without awaiting so it doesn't block the HTTP response.
		// `announcePlantToCentralBsky` is already no-throw internally; the
		// `.catch` here is belt-and-suspenders against future changes.
		if (inserted && parent.kind === "seed") {
			void announcePlantToCentralBsky({
				authorDid: did,
				title: record.title,
				budUri: uri,
			}).catch((err) => {
				console.error("[publishBud] announcePlant rejected", err);
			});
		}

		return { uri, cid };
	});

function rejectionToErrorName(reason: string): string {
	switch (reason) {
		case "word-limit-exceeded":
			return "WordLimitExceeded";
		case "invalid-formatting":
			return "InvalidFormatting";
		case "parent-required":
			return "ParentRequired";
		case "parent-not-found":
			return "ParentNotFound";
		case "parent-cid-mismatch":
			return "ParentCidMismatch";
		case "self-reply":
			return "SelfReply";
		case "parent-growing":
			return "ParentGrowing";
		case "not-seed-grantee":
			return "NotSeedGrantee";
		case "seed-expired":
			return "SeedExpired";
		case "seed-chain-broken":
			return "SeedChainBroken";
		case "seed-already-planted":
			return "SeedAlreadyPlanted";
		default:
			return reason;
	}
}
