import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../../db";
import { getSessionAgent } from "../auth/session";
import { budCreatePayload } from "../indexer/payload";
import {
	type BudRecord,
	type FormatSpan,
	validateBudCreate,
} from "../indexer/validate";

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
 * Flow:
 * 1. Require a session (`getSessionAgent`).
 * 2. Load the parent bud locally for its cid/rootUri/depth/pathUris.
 * 3. Run the same validators the Jetstream indexer runs, so we reject early
 *    instead of leaving an orphan in the user's PDS.
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

		const parent = await prisma.bud.findUnique({
			where: { uri: data.parentUri },
			select: {
				uri: true,
				cid: true,
				authorDid: true,
				createdAt: true,
				rootUri: true,
				depth: true,
				pathUris: true,
			},
		});
		if (!parent) {
			throw new Error("ParentNotFound");
		}

		const now = new Date();
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
			parent: {
				uri: parent.uri,
				cid: parent.cid,
				authorDid: parent.authorDid,
				createdAt: parent.createdAt,
			},
			isAllowedRoot: false,
			now,
		});
		if (!check.ok) {
			// Rejection reasons are strings that match the named errors in the
			// lexicon (word-limit-exceeded, self-reply, parent-growing,
			// parent-cid-mismatch, parent-not-found, parent-required).
			throw new Error(rejectionToErrorName(check.reason));
		}

		const pdsResp = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: BUD_COLLECTION,
			record: { $type: BUD_COLLECTION, ...record },
			validate: false,
		});
		const { uri, cid } = pdsResp.data;

		await prisma.bud.upsert({
			where: { uri },
			create: budCreatePayload({
				record,
				uri,
				cid,
				authorDid: did,
				parent: {
					uri: parent.uri,
					cid: parent.cid,
					rootUri: parent.rootUri,
					depth: parent.depth,
					pathUris: parent.pathUris,
				},
			}),
			update: {},
		});

		return { uri, cid };
	});

function rejectionToErrorName(reason: string): string {
	switch (reason) {
		case "word-limit-exceeded":
			return "WordLimitExceeded";
		case "parent-not-found":
			return "ParentNotFound";
		case "parent-cid-mismatch":
			return "ParentCidMismatch";
		case "self-reply":
			return "SelfReply";
		case "parent-growing":
			return "ParentGrowing";
		default:
			return reason;
	}
}
