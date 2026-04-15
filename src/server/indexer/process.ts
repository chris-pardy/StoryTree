import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { budCreatePayload } from "./payload.ts";
import {
	type BudRecord,
	type PollenRecord,
	validateBudCreate,
	validateBudDelete,
	validateBudUpdate,
	validatePollenCreate,
} from "./validate.ts";

type CommitBase = {
	did: string;
	time_us: number;
	kind: "commit";
};

type AnyRecord = (BudRecord | PollenRecord) & { $type?: string };

export type JetstreamCommitCreate = CommitBase & {
	commit: {
		rev: string;
		operation: "create";
		collection: string;
		rkey: string;
		record: AnyRecord;
		cid: string;
	};
};

export type JetstreamCommitUpdate = CommitBase & {
	commit: {
		rev: string;
		operation: "update";
		collection: string;
		rkey: string;
		record: AnyRecord;
		cid: string;
	};
};

export type JetstreamCommitDelete = CommitBase & {
	commit: {
		rev: string;
		operation: "delete";
		collection: string;
		rkey: string;
	};
};

export type ProcessDeps = {
	prisma: PrismaClient;
	isAllowedSeedAuthor: (did: string) => boolean;
	now: () => Date;
};

export type ProcessResult = { accepted: boolean; reason?: string };

function makeAtUri(did: string, collection: string, rkey: string): string {
	return `at://${did}/${collection}/${rkey}`;
}

async function loadExisting(prisma: PrismaClient, uri: string) {
	const row = await prisma.bud.findUnique({
		where: { uri },
		include: { _count: { select: { children: true } } },
	});
	if (!row) return null;
	return {
		uri: row.uri,
		authorDid: row.authorDid,
		createdAt: row.createdAt,
		childCount: row._count.children,
	};
}

export async function processBudCreate(
	event: JetstreamCommitCreate,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma, isAllowedSeedAuthor, now } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as BudRecord;

	const parent = record.parent
		? await prisma.bud.findUnique({ where: { uri: record.parent.uri } })
		: null;

	const result = validateBudCreate({
		record,
		authorDid: did,
		parent: parent
			? {
					uri: parent.uri,
					cid: parent.cid,
					authorDid: parent.authorDid,
					createdAt: parent.createdAt,
				}
			: null,
		isAllowedRoot: !record.parent && isAllowedSeedAuthor(did),
		now: now(),
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	const data = budCreatePayload({
		record,
		uri,
		cid: commit.cid,
		authorDid: did,
		parent: parent
			? {
					uri: parent.uri,
					cid: parent.cid,
					rootUri: parent.rootUri,
					depth: parent.depth,
					pathUris: parent.pathUris,
				}
			: null,
	});

	// Upsert so that a Jetstream replay OR a local write from the PDS-first
	// publish path (which inserts with identical content) is a no-op.
	await prisma.bud.upsert({
		where: { uri },
		create: data,
		update: {},
	});

	return { accepted: true };
}

export async function processBudUpdate(
	event: JetstreamCommitUpdate,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma, now } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as BudRecord;

	const existing = await loadExisting(prisma, uri);

	const result = validateBudUpdate({
		record,
		authorDid: did,
		existing,
		now: now(),
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	await prisma.$transaction(async (tx) => {
		await tx.pollen.deleteMany({ where: { subjectUri: uri } });
		await tx.bud.update({
			where: { uri },
			data: {
				cid: commit.cid,
				title: record.title,
				text: record.text,
				// Mirror `budCreatePayload` — persist the formatting spans on
				// edits, or clear them when the edit drops all marks. Nullable
				// JSON columns take `Prisma.DbNull` to null out the column.
				formatting:
					record.formatting && record.formatting.length > 0
						? (record.formatting as unknown as Prisma.InputJsonValue)
						: Prisma.DbNull,
			},
		});
	});

	return { accepted: true };
}

export async function processBudDelete(
	event: JetstreamCommitDelete,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma, now } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);

	const existing = await loadExisting(prisma, uri);

	const result = validateBudDelete({
		authorDid: did,
		existing,
		now: now(),
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	await prisma.bud.delete({ where: { uri } });

	return { accepted: true };
}

export async function processPollenCreate(
	event: JetstreamCommitCreate,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as PollenRecord;

	const subject = await prisma.bud.findUnique({
		where: { uri: record.subject.uri },
	});

	const existingPollen = subject
		? await prisma.pollen.findUnique({
				where: {
					authorDid_subjectUri: { authorDid: did, subjectUri: subject.uri },
				},
			})
		: null;

	const result = validatePollenCreate({
		record,
		authorDid: did,
		subject: subject
			? { uri: subject.uri, cid: subject.cid, authorDid: subject.authorDid }
			: null,
		hasExistingPollen: existingPollen !== null,
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	await prisma.pollen.upsert({
		where: { uri },
		create: {
			uri,
			authorDid: did,
			subjectUri: record.subject.uri,
			subjectCid: record.subject.cid,
			createdAt: new Date(record.createdAt),
		},
		update: {},
	});

	return { accepted: true };
}

export async function processPollenDelete(
	event: JetstreamCommitDelete,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);

	const existing = await prisma.pollen.findUnique({ where: { uri } });
	if (!existing) {
		return { accepted: false, reason: "pollen-not-found" };
	}
	if (existing.authorDid !== did) {
		return { accepted: false, reason: "author-mismatch" };
	}

	await prisma.pollen.delete({ where: { uri } });
	return { accepted: true };
}
