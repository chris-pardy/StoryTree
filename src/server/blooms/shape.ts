import type { Bloom } from "../../components/BloomCard";
import type { ResolvedActor } from "../identity/resolve";
import type { RankedBloom } from "./rank";

export type BloomRow = Omit<RankedBloom, "score">;

export function toBloom(
	row: BloomRow,
	handles: ReadonlyMap<string, ResolvedActor>,
): Bloom {
	const author = handles.get(row.authorDid);
	const rootAuthor = handles.get(row.rootAuthor);
	return {
		uri: row.uri,
		title: row.title,
		textPreview: row.textPreview,
		author: row.authorDid,
		authorHandle: author?.handle ?? undefined,
		authorDisplayName: author?.displayName ?? undefined,
		createdAt: row.createdAt.toISOString(),
		intermediateCount: row.intermediateCount,
		pollenCount: row.pollenCount,
		budCount: row.budCount,
		root: {
			uri: row.rootUri,
			title: row.rootTitle,
			author: row.rootAuthor,
			authorHandle: rootAuthor?.handle ?? undefined,
			authorDisplayName: rootAuthor?.displayName ?? undefined,
		},
	};
}
