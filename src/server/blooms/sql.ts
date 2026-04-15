import { Prisma } from "../../generated/prisma/client.js";
import { TEXT_PREVIEW_LIMIT } from "../config";

// `Prisma.raw` is required because `INTERVAL '... hours'` and column
// references can't be bind parameters — Postgres needs them as literal SQL.
// Callers pass numeric/identifier values they control; never user input.

export function intervalSql(hours: number): Prisma.Sql {
	return Prisma.sql`INTERVAL '${Prisma.raw(`${hours} hours`)}'`;
}

export function textPreviewSql(textColumn: string): Prisma.Sql {
	const col = Prisma.raw(textColumn);
	return Prisma.sql`CASE WHEN LENGTH(${col}) > ${TEXT_PREVIEW_LIMIT} THEN LEFT(${col}, ${TEXT_PREVIEW_LIMIT}) || '…' ELSE ${col} END`;
}
