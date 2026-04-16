import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client.js";
import {
	type ResolvedActor,
	resolveHandles,
} from "../../server/identity/resolve";
import type { FormatSpan } from "../../server/indexer/validate";
import { renderBudBody } from "./render-bud";
import type { Story } from "./types";

// Default collection for the `/bud/$id/$rkey` shorthand route. The full
// AT-URI route (`/at/...`) accepts any collection embedded in the URI.
const DEFAULT_BUD_COLLECTION = "ink.branchline.bud";

/**
 * `/at://did/collection/rkey` lands in splat with the leading `//` still
 * attached. Prepend `at://` after stripping the leading slashes.
 */
export function parseFullAtUri(splat: string): string | null {
	const stripped = splat.replace(/^\/+/, "");
	if (!stripped) return null;
	const uri = `at://${stripped}`;
	// Sanity: must look like `at://<authority>/<collection>/<rkey>`.
	const parts = stripped.split("/");
	if (parts.length < 3) return null;
	return uri;
}

/**
 * `/bud/<did-or-handle>/<rkey>` — reconstruct to a default-collection AT-URI.
 * v1 treats handles as opaque identifiers; handle→DID resolution is future work.
 */
export function parseBudShorthand(splat: string): string | null {
	const stripped = splat.replace(/^\/+/, "");
	const parts = stripped.split("/");
	if (parts.length !== 2) return null;
	const [identifier, rkey] = parts;
	if (!identifier || !rkey) return null;
	return `at://${identifier}/${DEFAULT_BUD_COLLECTION}/${rkey}`;
}

/**
 * Stable per-bud DOM anchor id. Used as the `<article id>` on each story
 * piece so individual pieces are linkable, and as the post-publish hash
 * (`#bud-<rkey>` to scroll, `#bud-<rkey>-share` to scroll AND auto-open
 * the bluesky share prompt). Returns null on URIs that don't match the
 * expected `at://<authority>/<collection>/<rkey>` shape.
 */
export function anchorForBudUri(uri: string): string | null {
	const stripped = uri.replace(/^at:\/\//, "");
	const parts = stripped.split("/");
	if (parts.length !== 3) return null;
	const rkey = parts[2];
	if (!rkey) return null;
	return `bud-${rkey}`;
}

type PathRow = {
	uri: string;
	title: string | null;
	text: string;
	formatting: unknown;
	authorDid: string;
	createdAt: Date;
	position: number;
	pollenCount: number;
	childCount: number;
};

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(s: string) {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * Coerce the raw JSON column into the typed format-span array the
 * renderer expects, or `null` if the column is empty / malformed.
 */
function coerceFormatting(raw: unknown): Array<FormatSpan> | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	return raw as Array<FormatSpan>;
}

function rowToStory(
	row: PathRow,
	handles: ReadonlyMap<string, ResolvedActor>,
): Story {
	const actor = handles.get(row.authorDid);
	return {
		id: row.uri,
		title: row.title || undefined,
		author: row.authorDid,
		authorHandle: actor?.handle ?? undefined,
		authorDisplayName: actor?.displayName ?? undefined,
		timestamp: row.createdAt.toISOString(),
		pollen: row.pollenCount,
		body: renderBudBody(row.text, coerceFormatting(row.formatting)),
		childCount: row.childCount,
	};
}

type LeafRow = {
	uri: string;
	title: string | null;
	text: string;
	formatting: unknown;
	authorDid: string;
	createdAt: Date;
	pollenCount: number;
	rootTitle: string | null;
};

export type LeafPayload = {
	story: Story;
	rootTitle: string | null;
};

/**
 * Compose a human-readable title for a bud path, matching the masthead shape
 * in ReadingColumn: when root and leaf titles differ, combine them; otherwise
 * fall back to whichever is present.
 */
export function composeBudTitle(
	rootTitle?: string | null,
	leafTitle?: string | null,
): string {
	const first = rootTitle?.trim() || null;
	const last = leafTitle?.trim() || null;
	if (first && last && first !== last) return `${first} and ${last}`;
	return last ?? first ?? "Stories";
}

/**
 * Fetch the bud itself plus the root title. Cheap — one query — so the loader
 * can await it, throw `notFound()` on 404, hand the Suspense fallback enough
 * data to render a single-story masthead while the full path streams in, and
 * compose the page `<title>` via `head()` without waiting on `fetchBudPath`.
 */
export const fetchLeaf = createServerFn({ method: "GET" })
	.inputValidator((uri: string) => uri)
	.handler(async ({ data: uri }): Promise<LeafPayload> => {
		const rows = await prisma.$queryRaw<Array<LeafRow>>(Prisma.sql`
      SELECT
        b.uri,
        b.title,
        b.text,
        b.formatting,
        b."authorDid",
        b."createdAt",
        COALESCE(
          (SELECT COUNT(*)::int FROM "Pollen" p WHERE p."subjectUri" = b.uri),
          0
        ) AS "pollenCount",
        (SELECT r.title FROM "Bud" r WHERE r.uri = b."pathUris"[1]) AS "rootTitle"
      FROM "Bud" b
      WHERE b.uri = ${uri}
    `);
		const row = rows[0];
		if (!row) throw notFound();
		const handles = await resolveHandles([row.authorDid]);
		return {
			story: rowToStory(
				{
					uri: row.uri,
					title: row.title,
					text: row.text,
					formatting: row.formatting,
					authorDid: row.authorDid,
					createdAt: row.createdAt,
					position: 0,
					pollenCount: row.pollenCount,
					childCount: 0,
				},
				handles,
			),
			rootTitle: row.rootTitle,
		};
	});

/**
 * Fetch the ordered root→bud path for a bud URI.
 *
 * Reads the target bud's packed `pathUris` array from `Bud`, slices it to the
 * requested window, and joins each element back to `Bud` for the payload.
 * Pollen counts via a scalar subquery in the same SELECT, so no N+1.
 *
 * `startPos`/`endPos` form an inclusive cursor window — v1 always passes the
 * defaults; a v2 infinite-scroll caller can pull slices without changing the
 * query shape. Postgres array slicing is 1-indexed and inclusive, hence
 * `[startPos + 1 : endPos + 1]`.
 */
export const fetchBudPath = createServerFn({ method: "GET" })
	.inputValidator(
		(args: { uri: string; startPos?: number; endPos?: number }) => args,
	)
	.handler(async ({ data }): Promise<Array<Story>> => {
		const { uri, startPos = 0, endPos = 1_000_000 } = data;
		const rows = await prisma.$queryRaw<Array<PathRow>>(Prisma.sql`
      WITH target AS (
        SELECT "pathUris"[${startPos + 1}:${endPos + 1}] AS slice
        FROM "Bud"
        WHERE uri = ${uri}
      )
      SELECT
        b.uri,
        b.title,
        b.text,
        b.formatting,
        b."authorDid",
        b."createdAt",
        (u.ord + ${startPos} - 1)::int AS position,
        COALESCE(
          (SELECT COUNT(*)::int FROM "Pollen" p WHERE p."subjectUri" = b.uri),
          0
        ) AS "pollenCount",
        COALESCE(
          (SELECT COUNT(*)::int FROM "Bud" c WHERE c."parentUri" = b.uri),
          0
        ) AS "childCount"
      FROM target, unnest(target.slice) WITH ORDINALITY AS u(path_uri, ord)
      INNER JOIN "Bud" b ON b.uri = u.path_uri
      ORDER BY u.ord
    `);
		const handles = await resolveHandles(rows.map((r) => r.authorDid));
		return rows.map((row) => rowToStory(row, handles));
	});

export type BranchChild = {
	uri: string;
	title: string;
	author: string;
	authorHandle?: string;
	authorDisplayName?: string;
	createdAt: string;
	pollenCount: number;
	childCount: number;
	textPreview: string;
};

type ChildRow = {
	uri: string;
	title: string | null;
	authorDid: string;
	createdAt: Date;
	pollenCount: number;
	childCount: number;
	textPreview: string;
};

/**
 * Fetch the direct children of a bud. Used by the branch exploration UI
 * to show which buds sprouted from a given point in the story.
 */
export const fetchBudChildren = createServerFn({ method: "GET" })
	.inputValidator((args: { parentUri: string; limit?: number }) => args)
	.handler(async ({ data }): Promise<Array<BranchChild>> => {
		const { parentUri, limit = 20 } = data;
		const rows = await prisma.$queryRaw<Array<ChildRow>>(Prisma.sql`
      SELECT
        b.uri,
        b.title,
        b."authorDid",
        b."createdAt",
        COALESCE(
          (SELECT COUNT(*)::int FROM "Pollen" p WHERE p."subjectUri" = b.uri),
          0
        ) AS "pollenCount",
        COALESCE(
          (SELECT COUNT(*)::int FROM "Bud" c WHERE c."parentUri" = b.uri),
          0
        ) AS "childCount",
        LEFT(b.text, 240) AS "textPreview"
      FROM "Bud" b
      WHERE b."parentUri" = ${parentUri}
      ORDER BY b."createdAt" ASC
      LIMIT ${limit}
    `);
		const handles = await resolveHandles(rows.map((r) => r.authorDid));
		return rows.map((row) => {
			const actor = handles.get(row.authorDid);
			return {
				uri: row.uri,
				title: row.title || "Untitled",
				author: row.authorDid,
				authorHandle: actor?.handle ?? undefined,
				authorDisplayName: actor?.displayName ?? undefined,
				createdAt: row.createdAt.toISOString(),
				pollenCount: row.pollenCount,
				childCount: row.childCount,
				textPreview: row.textPreview,
			};
		});
	});
