import type { Agent } from "@atproto/api";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client.js";
import type { BudRecord } from "../indexer/validate";
import { validateBudUpdate } from "../indexer/validate";
import type { EditBudInput, EditBudOutput } from "./edit";
import { rejectionToErrorName } from "./edit";

// Live record collection — see `lexicons/ink/branchline/bud.json`.
const BUD_COLLECTION = "ink.branchline.bud";

/**
 * Core editBud logic shared by the TanStack Start server function (used by
 * the first-party UI) and the public XRPC handler. Throws `Error(<errorName>)`
 * on rejection; callers map those to HTTP statuses or surface them to the
 * client.
 *
 * Flow:
 * 1. Parse the rkey off the supplied URI — the repo segment must be the
 *    caller's own DID. This is a cheap ownership gate before we hit the DB.
 * 2. Load the existing bud row (`authorDid`, `locked`, child count, and the
 *    preserved `createdAt` + parent strongRef).
 * 3. `validateBudUpdate` — same rules the Jetstream indexer applies on a
 *    record-update commit (author match, no children, not locked, word
 *    limit, well-formed formatting). The `locked` gate is enforced here too
 *    so direct-to-PDS edits that bypass this endpoint still get rejected on
 *    firehose replay.
 * 4. `agent.com.atproto.repo.putRecord` with the original rkey — PDS
 *    overwrites the record and returns the new CID.
 * 5. Mirror the same state `processBudUpdate` lands from the firehose:
 *    drop pollen (edits invalidate prior reads) and update the row in place.
 */
export async function performEditBud(params: {
	agent: Agent;
	did: string;
	input: EditBudInput;
}): Promise<EditBudOutput> {
	const { agent, did, input } = params;

	const parsed = parseBudAtUri(input.uri);
	if (!parsed) {
		throw new Error("BudNotFound");
	}
	if (parsed.did !== did) {
		throw new Error("NotOwner");
	}

	const existing = await prisma.bud.findUnique({
		where: { uri: input.uri },
		select: {
			uri: true,
			authorDid: true,
			locked: true,
			createdAt: true,
			parentUri: true,
			parentCid: true,
			_count: { select: { children: true } },
		},
	});
	if (!existing) {
		throw new Error("BudNotFound");
	}

	const record: BudRecord = {
		title: input.title.trim() || "Untitled",
		text: input.text,
		parent:
			existing.parentUri && existing.parentCid
				? { uri: existing.parentUri, cid: existing.parentCid }
				: undefined,
		createdAt: existing.createdAt.toISOString(),
		formatting:
			input.formatting && input.formatting.length > 0
				? input.formatting
				: undefined,
	};

	const check = validateBudUpdate({
		record,
		authorDid: did,
		existing: {
			uri: existing.uri,
			authorDid: existing.authorDid,
			childCount: existing._count.children,
			locked: existing.locked,
		},
	});
	if (!check.ok) {
		throw new Error(rejectionToErrorName(check.reason));
	}

	const pdsResp = await agent.com.atproto.repo.putRecord({
		repo: did,
		collection: BUD_COLLECTION,
		rkey: parsed.rkey,
		record: { $type: BUD_COLLECTION, ...record },
		validate: false,
	});
	const { uri, cid } = pdsResp.data;

	await prisma.$transaction(async (tx) => {
		await tx.pollen.deleteMany({ where: { subjectUri: uri } });
		await tx.bud.update({
			where: { uri },
			data: {
				cid,
				title: record.title,
				text: record.text,
				formatting:
					record.formatting && record.formatting.length > 0
						? (record.formatting as unknown as Prisma.InputJsonValue)
						: Prisma.DbNull,
			},
		});
	});

	return { uri, cid };
}

function parseBudAtUri(uri: string): { did: string; rkey: string } | null {
	const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
	if (!m) return null;
	return { did: m[1], rkey: m[2] };
}
