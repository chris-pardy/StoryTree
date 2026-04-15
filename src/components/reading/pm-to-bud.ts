/**
 * Convert a ProseMirror document (from TipTap's `editor.getJSON()`) into the
 * `(text, formatting)` pair the Bud record schema expects.
 *
 * Schema contract (from `lexicons/ink/branchline/bud.json`):
 * - `text` is a plain string with paragraphs joined by `\n\n`.
 * - `formatting` is an array of `{ start, end, type }` spans where
 *   `start`/`end` are **byte** offsets (UTF-8), end-exclusive, and `type` is
 *   one of `'bold' | 'italic' | 'underline' | 'strikethrough'`.
 *
 * Notes:
 * - Blockquote is flattened to its inner paragraphs — the lexicon has no
 *   blockquote format type yet, so the visual structure is lost on save.
 * - Adjacent same-type spans are merged post-walk so a run like
 *   `<em>foo</em><em>bar</em>` becomes one span.
 */

import type { FormatSpan } from "#/server/indexer/validate";

export type { FormatSpan };

export type ProseMirrorNode = {
	type: string;
	content?: Array<ProseMirrorNode>;
	text?: string;
	marks?: Array<{ type: string }>;
};

const MARK_MAP: Record<string, FormatSpan["type"]> = {
	bold: "bold",
	italic: "italic",
	underline: "underline",
	strike: "strikethrough",
};

const enc = new TextEncoder();
const byteLength = (s: string) => enc.encode(s).length;

export function proseMirrorToBud(doc: ProseMirrorNode): {
	text: string;
	formatting: Array<FormatSpan>;
} {
	let text = "";
	const spans: Array<FormatSpan> = [];

	const walkBlock = (node: ProseMirrorNode) => {
		if (node.type === "paragraph") {
			if (text.length > 0) text += "\n\n";
			walkInline(node.content ?? []);
		} else if (node.type === "blockquote") {
			// Flatten blockquote — each inner paragraph becomes a top-level one.
			for (const child of node.content ?? []) walkBlock(child);
		} else if (node.type === "hardBreak") {
			text += "\n";
		} else if (node.type === "text") {
			walkInline([node]);
		} else if (node.content) {
			for (const child of node.content) walkBlock(child);
		}
	};

	const walkInline = (items: Array<ProseMirrorNode>) => {
		for (const item of items) {
			if (item.type === "text" && typeof item.text === "string") {
				const start = byteLength(text);
				text += item.text;
				const end = byteLength(text);
				for (const mark of item.marks ?? []) {
					const mapped = MARK_MAP[mark.type];
					if (mapped) spans.push({ start, end, type: mapped });
				}
			} else if (item.type === "hardBreak") {
				text += "\n";
			}
		}
	};

	for (const child of doc.content ?? []) walkBlock(child);

	// Merge adjacent same-type spans.
	spans.sort((a, b) =>
		a.type < b.type ? -1 : a.type > b.type ? 1 : a.start - b.start,
	);
	const merged: Array<FormatSpan> = [];
	for (const span of spans) {
		const last = merged[merged.length - 1];
		if (last && last.type === span.type && last.end === span.start) {
			last.end = span.end;
		} else {
			merged.push({ ...span });
		}
	}
	// Sort final output by start offset for stable downstream handling.
	merged.sort((a, b) => a.start - b.start || a.end - b.end);

	return { text, formatting: merged };
}
