import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../../db";
import { getSessionAgent } from "../auth/session";
import { type PollenRecord, validatePollenCreate } from "../indexer/validate";

// Live record collection — see `lexicons/ink/branchline/pollen.json`.
const POLLEN_COLLECTION = "ink.branchline.pollen";

// Mirrors `ink.branchline.createPollen` schema. Kept inline to keep the
// generated lexicon tree out of the type-check graph; the JSON file is
// still the source of truth.
type InputSchema = { subjectUri: string };
type OutputSchema = { uri: string; cid: string };

/**
 * AppView-side implementation of `ink.branchline.createPollen`. Contract lives
 * in `lexicons/ink/branchline/createPollen.json`; input/output types are
 * generated from that file via `pnpm lex:gen`.
 *
 * Same PDS-first pattern as `publishBud`: validate locally against the same
 * rules `processPollenCreate` runs from the firehose, write to the caller's
 * PDS, then upsert the mirror row so a Jetstream replay is a no-op.
 */
export const createPollen = createServerFn({ method: "POST" })
	.inputValidator((args: InputSchema) => args)
	.handler(async ({ data }): Promise<OutputSchema> => {
		const session = await getSessionAgent(getRequest());
		if (!session) {
			throw new Error("Unauthorized");
		}
		const { agent, did } = session;

		const subject = await prisma.bud.findUnique({
			where: { uri: data.subjectUri },
			select: { uri: true, cid: true, authorDid: true },
		});
		if (!subject) {
			throw new Error("SubjectNotFound");
		}

		const existing = await prisma.pollen.findUnique({
			where: {
				authorDid_subjectUri: {
					authorDid: did,
					subjectUri: subject.uri,
				},
			},
		});

		const now = new Date();
		const record: PollenRecord = {
			subject: { uri: subject.uri, cid: subject.cid },
			createdAt: now.toISOString(),
		};

		const check = validatePollenCreate({
			record,
			authorDid: did,
			subject: {
				uri: subject.uri,
				cid: subject.cid,
				authorDid: subject.authorDid,
			},
			hasExistingPollen: existing !== null,
		});
		if (!check.ok) {
			throw new Error(rejectionToErrorName(check.reason));
		}

		// `validate: false` because the PDS doesn't know our custom lexicon; we
		// already ran `validatePollenCreate` locally, which mirrors what the
		// Jetstream indexer enforces. Matches the `publishBud` flow.
		const pdsResp = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: POLLEN_COLLECTION,
			record: { $type: POLLEN_COLLECTION, ...record },
			validate: false,
		});
		const { uri, cid } = pdsResp.data;

		await prisma.pollen.upsert({
			where: { uri },
			create: {
				uri,
				authorDid: did,
				subjectUri: subject.uri,
				subjectCid: subject.cid,
				createdAt: now,
			},
			update: {},
		});

		return { uri, cid };
	});

function rejectionToErrorName(reason: string): string {
	switch (reason) {
		case "subject-not-found":
			return "SubjectNotFound";
		case "subject-cid-mismatch":
			return "SubjectCidMismatch";
		case "self-pollinate":
			return "SelfPollinate";
		case "duplicate-pollen":
			return "DuplicatePollen";
		default:
			return reason;
	}
}
