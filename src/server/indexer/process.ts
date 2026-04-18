import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { budCreatePayload, seedCreatePayload } from "./payload.ts";
import {
	type BudRecord,
	type ParentLookup,
	type PollenRecord,
	type SeedRecord,
	validateBudCreate,
	validateBudDelete,
	validateBudUpdate,
	validatePollenCreate,
	validateSeedCreate,
	validateSeedDelete,
	validateSeedUpdate,
} from "./validate.ts";

type CommitBase = {
	did: string;
	time_us: number;
	kind: "commit";
};

type AnyRecord = (BudRecord | PollenRecord | SeedRecord) & { $type?: string };

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
	now: () => Date;
};

export type ResolvedBudParent = {
	kind: "bud";
	uri: string;
	cid: string;
	authorDid: string | null;
	bloomsAt: Date;
	locked: boolean;
	rootUri: string;
	depth: number;
	pathUris: Array<string>;
	seedUri: string;
	seedCid: string;
};

export type ResolvedSeedParent = {
	kind: "seed";
	uri: string;
	cid: string;
	granteeDid: string;
	expiresAt: Date | null;
	chainValid: boolean;
	alreadyPlanted: boolean;
};

export type ResolvedParent = ResolvedBudParent | ResolvedSeedParent;

export function resolvedParentToLookup(parent: ResolvedParent): ParentLookup {
	if (parent.kind === "bud") {
		return {
			kind: "bud",
			uri: parent.uri,
			cid: parent.cid,
			authorDid: parent.authorDid,
			bloomsAt: parent.bloomsAt,
			locked: parent.locked,
		};
	}
	return {
		kind: "seed",
		uri: parent.uri,
		cid: parent.cid,
		granteeDid: parent.granteeDid,
		expiresAt: parent.expiresAt,
		chainValid: parent.chainValid,
		alreadyPlanted: parent.alreadyPlanted,
	};
}

export async function resolveBudParent(
	prisma: PrismaClient,
	parentUri: string,
	now: Date,
	selfUri: string = "",
): Promise<ResolvedParent | null> {
	const budRow = await prisma.bud.findUnique({ where: { uri: parentUri } });
	if (budRow) {
		return {
			kind: "bud",
			uri: budRow.uri,
			cid: budRow.cid,
			authorDid: budRow.authorDid,
			bloomsAt: budRow.bloomsAt,
			locked: budRow.locked,
			rootUri: budRow.rootUri,
			depth: budRow.depth,
			pathUris: budRow.pathUris,
			seedUri: budRow.seedUri,
			seedCid: budRow.seedCid,
		};
	}

	const seedRow = await prisma.seed.findUnique({ where: { uri: parentUri } });
	if (!seedRow) return null;

	const chain = await prisma.seed.findMany({
		where: { uri: { in: seedRow.chainUris } },
	});
	let chainValid = chain.length === seedRow.chainUris.length;
	if (chainValid) {
		const byUri = new Map(chain.map((s) => [s.uri, s]));
		for (let i = 0; i < seedRow.chainUris.length; i++) {
			const s = byUri.get(seedRow.chainUris[i]);
			if (!s) {
				chainValid = false;
				break;
			}
			if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) {
				chainValid = false;
				break;
			}
			if (i > 0) {
				const parent = byUri.get(seedRow.chainUris[i - 1]);
				if (!parent || parent.granteeDid !== s.authorDid) {
					chainValid = false;
					break;
				}
			}
		}
	}

	const plantedExists = await prisma.bud.findFirst({
		where: { seedUri: seedRow.uri, parentUri: null, NOT: { uri: selfUri } },
		select: { uri: true },
	});

	return {
		kind: "seed",
		uri: seedRow.uri,
		cid: seedRow.cid,
		granteeDid: seedRow.granteeDid,
		expiresAt: seedRow.expiresAt,
		chainValid,
		alreadyPlanted: plantedExists !== null,
	};
}

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
		childCount: row._count.children,
	};
}

async function loadExistingSeed(prisma: PrismaClient, uri: string) {
	const row = await prisma.seed.findUnique({
		where: { uri },
		include: { _count: { select: { buds: true } } },
	});
	if (!row) return null;
	return {
		uri: row.uri,
		authorDid: row.authorDid,
		grantorUri: row.grantorUri,
		hasBud: row._count.buds > 0,
	};
}

export async function processBudCreate(
	event: JetstreamCommitCreate,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma, now } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as BudRecord;

	const nowAt = now();
	const parent = record.parent
		? await resolveBudParent(prisma, record.parent.uri, nowAt, uri)
		: null;

	const parentForValidate: ParentLookup | null = parent
		? resolvedParentToLookup(parent)
		: null;

	const result = validateBudCreate({
		record,
		authorDid: did,
		parent: parentForValidate,
		now: nowAt,
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	// Validation guarantees parent is non-null when ok.
	if (!parent)
		throw new Error("bud-create: parent resolved to null after ok validation");

	const data = budCreatePayload({
		record,
		uri,
		cid: commit.cid,
		authorDid: did,
		parent,
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
	const { prisma } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as BudRecord;

	const existing = await loadExisting(prisma, uri);

	const result = validateBudUpdate({
		record,
		authorDid: did,
		existing,
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
	const { prisma } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);

	const existing = await loadExisting(prisma, uri);

	const result = validateBudDelete({
		authorDid: did,
		existing,
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	// Hard delete when no one has branched off (pollen cascades via FK).
	// Otherwise soft-delete: keep the row so descendants stay attached, but
	// null the author and wipe content; pollen has to be removed explicitly
	// because the bud row itself isn't going away.
	if (existing && existing.childCount === 0) {
		await prisma.bud.delete({ where: { uri } });
	} else {
		await prisma.$transaction(async (tx) => {
			await tx.pollen.deleteMany({ where: { subjectUri: uri } });
			await tx.bud.update({
				where: { uri },
				data: {
					authorDid: null,
					title: "",
					text: "",
					formatting: Prisma.DbNull,
				},
			});
		});
	}

	return { accepted: true };
}

export async function processSeedCreate(
	event: JetstreamCommitCreate,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma, now } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as SeedRecord;

	const grantor = record.grantor
		? await prisma.seed.findUnique({
				where: { uri: record.grantor },
				include: { child: { select: { uri: true } } },
			})
		: null;

	// For root seeds (no grantor), check the Permission table to see if
	// this DID is allowed to create them.
	let isAllowedRoot = false;
	if (!record.grantor) {
		const perm = await prisma.permission.findUnique({
			where: { did },
			select: { canGrantSeeds: true },
		});
		isAllowedRoot = perm?.canGrantSeeds === true;
	}

	const result = validateSeedCreate({
		record,
		authorDid: did,
		grantor: grantor
			? {
					uri: grantor.uri,
					granteeDid: grantor.granteeDid,
					chainUris: grantor.chainUris,
					expiresAt: grantor.expiresAt,
					hasChild: grantor.child !== null && grantor.child.uri !== uri,
				}
			: null,
		isAllowedRoot,
		now: now(),
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	const data = seedCreatePayload({
		record,
		uri,
		cid: commit.cid,
		authorDid: did,
		grantor: grantor
			? { uri: grantor.uri, chainUris: grantor.chainUris }
			: null,
	});

	await prisma.seed.upsert({
		where: { uri },
		create: data,
		update: {},
	});

	return { accepted: true };
}

export async function processSeedUpdate(
	event: JetstreamCommitUpdate,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);
	const record = commit.record as SeedRecord;

	const existing = await loadExistingSeed(prisma, uri);

	const result = validateSeedUpdate({
		record,
		authorDid: did,
		existing,
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	await prisma.seed.update({
		where: { uri },
		data: {
			cid: commit.cid,
			granteeDid: record.grantee,
			expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
		},
	});

	return { accepted: true };
}

export async function processSeedDelete(
	event: JetstreamCommitDelete,
	deps: ProcessDeps,
): Promise<ProcessResult> {
	const { prisma } = deps;
	const { did, commit } = event;
	const uri = makeAtUri(did, commit.collection, commit.rkey);

	const existing = await loadExistingSeed(prisma, uri);

	const result = validateSeedDelete({
		authorDid: did,
		existing,
	});

	if (!result.ok) {
		return { accepted: false, reason: result.reason };
	}

	await prisma.seed.delete({ where: { uri } });

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
