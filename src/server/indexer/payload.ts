import type { Prisma } from "../../generated/prisma/client.js";
import type { BudRecord, SeedRecord } from "./validate.ts";
import { GROWING_MS } from "./validate.ts";

/**
 * Single source of truth for mapping a validated `BudRecord` + identity
 * (`uri`, `cid`, `authorDid`) and a parent lookup into a Prisma row.
 *
 * Used by:
 * - the Jetstream indexer (`processBudCreate`) when a record comes off the firehose,
 * - the PDS-first publish server fn (`publishContinuation`) when a record
 *   is created by the local UI.
 *
 * Both paths must produce byte-identical rows so that whichever one lands
 * in Postgres second is a content-neutral no-op. The only non-deterministic
 * fields are `uri` and `cid`, and those are supplied by the caller from
 * the PDS response (publish path) or the Jetstream commit (indexer path).
 */
export type BudParentPayload = {
	kind: "bud";
	uri: string;
	cid: string;
	rootUri: string;
	depth: number;
	pathUris: Array<string>;
	seedUri: string;
	seedCid: string;
};

export type SeedParentPayload = {
	kind: "seed";
	uri: string;
	cid: string;
};

export function budCreatePayload(args: {
	record: BudRecord;
	uri: string;
	cid: string;
	authorDid: string;
	parent: BudParentPayload | SeedParentPayload;
}): Prisma.BudUncheckedCreateInput {
	const { record, uri, cid, authorDid, parent } = args;
	const createdAt = new Date(record.createdAt);
	const base = {
		uri,
		cid,
		authorDid,
		title: record.title,
		text: record.text,
		formatting:
			record.formatting && record.formatting.length > 0
				? (record.formatting as unknown as Prisma.InputJsonValue)
				: undefined,
		createdAt,
		bloomsAt: new Date(createdAt.getTime() + GROWING_MS),
	};
	if (parent.kind === "bud") {
		return {
			...base,
			rootUri: parent.rootUri,
			parentUri: parent.uri,
			parentCid: parent.cid,
			seedUri: parent.seedUri,
			seedCid: parent.seedCid,
			depth: parent.depth + 1,
			pathUris: [...parent.pathUris, uri],
		};
	}
	return {
		...base,
		rootUri: uri,
		parentUri: null,
		parentCid: null,
		seedUri: parent.uri,
		seedCid: parent.cid,
		depth: 0,
		pathUris: [uri],
	};
}

export function seedCreatePayload(args: {
	record: SeedRecord;
	uri: string;
	cid: string;
	authorDid: string;
	grantor: { uri: string; chainUris: Array<string> } | null;
}): Prisma.SeedUncheckedCreateInput {
	const { record, uri, cid, authorDid, grantor } = args;
	return {
		uri,
		cid,
		authorDid,
		granteeDid: record.grantee,
		grantorUri: grantor?.uri ?? null,
		chainUris: grantor ? [...grantor.chainUris, uri] : [uri],
		expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
		createdAt: new Date(record.createdAt),
	};
}
