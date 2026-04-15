import type { FormatSpan } from "#/server/indexer/validate";

/**
 * Render a validated bud (`text`, `formatting`) to HTML. Mirror of the
 * `pm-to-bud.ts` conversion direction: the text is the plain UTF-8 buffer
 * the record stored, paragraphs joined by `\n\n`, soft breaks by `\n`, and
 * `formatting` carries byte-offset inline spans.
 *
 * Spans are clamped per paragraph before rendering. Overlapping spans are
 * handled by slicing the paragraph at every span boundary and wrapping each
 * slice in the intersection of marks active across it — so nested `<em>` /
 * `<strong>` ranges always produce balanced HTML.
 *
 * The output is safe to drop into `dangerouslySetInnerHTML`: user text is
 * HTML-escaped, and the only tags emitted are the fixed format tags plus
 * `<p>` / `<br>`.
 */

const FORMAT_ORDER: ReadonlyArray<FormatSpan["type"]> = [
	"bold",
	"italic",
	"underline",
	"strikethrough",
];

const FORMAT_TAG: Record<FormatSpan["type"], readonly [string, string]> = {
	bold: ["<strong>", "</strong>"],
	italic: ["<em>", "</em>"],
	underline: ["<u>", "</u>"],
	strikethrough: ["<s>", "</s>"],
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

function escapeWithSoftBreaks(s: string): string {
	return escapeHtml(s).replace(/\n/g, "<br>");
}

function renderParagraph(
	text: string,
	spans: ReadonlyArray<FormatSpan>,
): string {
	if (spans.length === 0) return escapeWithSoftBreaks(text);

	const bytes = encoder.encode(text);
	const boundaries = new Set<number>([0, bytes.length]);
	for (const span of spans) {
		boundaries.add(Math.max(0, Math.min(bytes.length, span.start)));
		boundaries.add(Math.max(0, Math.min(bytes.length, span.end)));
	}
	const ordered = [...boundaries].sort((a, b) => a - b);

	let html = "";
	for (let i = 0; i < ordered.length - 1; i++) {
		const from = ordered[i];
		const to = ordered[i + 1];
		if (from === to) continue;

		const active = new Set<FormatSpan["type"]>();
		for (const span of spans) {
			if (span.start <= from && span.end >= to) active.add(span.type);
		}

		// Decode in a stable tag order so overlapping spans produce balanced
		// `<strong><em>...</em></strong>` pairings rather than `<em><strong>`
		// followed by `</em></strong>`.
		const activeOrdered = FORMAT_ORDER.filter((t) => active.has(t));
		const opens = activeOrdered.map((t) => FORMAT_TAG[t][0]).join("");
		const closes = activeOrdered
			.slice()
			.reverse()
			.map((t) => FORMAT_TAG[t][1])
			.join("");

		const slice = decoder.decode(bytes.slice(from, to));
		html += opens + escapeWithSoftBreaks(slice) + closes;
	}
	return html;
}

export function renderBudBody(
	text: string,
	formatting?: ReadonlyArray<FormatSpan> | null,
): string {
	const spans = formatting ?? [];
	const paragraphs = text.split("\n\n");

	let byteCursor = 0;
	const parts: string[] = [];
	for (const paragraph of paragraphs) {
		const paragraphBytes = encoder.encode(paragraph).length;
		const pStart = byteCursor;
		const pEnd = byteCursor + paragraphBytes;

		const localSpans: FormatSpan[] = [];
		for (const span of spans) {
			if (span.end <= pStart || span.start >= pEnd) continue;
			localSpans.push({
				start: Math.max(0, span.start - pStart),
				end: Math.min(paragraphBytes, span.end - pStart),
				type: span.type,
			});
		}

		parts.push(`<p>${renderParagraph(paragraph, localSpans)}</p>`);
		// `\n\n` separator between paragraphs is 2 bytes in UTF-8.
		byteCursor = pEnd + 2;
	}
	return parts.join("");
}
