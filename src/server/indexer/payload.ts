import type { Prisma } from "../../generated/prisma/client.js";
import type { BudRecord } from "./validate.ts";

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
export function budCreatePayload(args: {
	record: BudRecord;
	uri: string;
	cid: string;
	authorDid: string;
	parent: {
		uri: string;
		cid: string;
		rootUri: string;
		depth: number;
		pathUris: Array<string>;
	} | null;
}): Prisma.BudUncheckedCreateInput {
	const { record, uri, cid, authorDid, parent } = args;
	return {
		uri,
		cid,
		authorDid,
		rootUri: parent ? parent.rootUri : uri,
		parentUri: parent?.uri ?? null,
		parentCid: parent?.cid ?? null,
		depth: parent ? parent.depth + 1 : 0,
		title: record.title,
		text: record.text,
		formatting:
			record.formatting && record.formatting.length > 0
				? (record.formatting as unknown as Prisma.InputJsonValue)
				: undefined,
		pathUris: parent ? [...parent.pathUris, uri] : [uri],
		createdAt: new Date(record.createdAt),
	};
}
