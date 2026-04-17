import { useMemo } from "react";
import type { FormatSpan } from "#/generated/lexicons/types/ink/branchline/bud";

const FORMAT_ORDER = ["bold", "italic", "underline", "strikethrough"] as const;

const FORMAT_TAG: Record<string, readonly [string, string]> = {
	bold: ["<strong>", "</strong>"],
	italic: ["<em>", "</em>"],
	underline: ["<u>", "</u>"],
	strikethrough: ["<s>", "</s>"],
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return c;
		}
	});
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

		const active = new Set<string>();
		for (const span of spans) {
			if (span.start <= from && span.end >= to) active.add(span.type);
		}

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

function renderBudBody(
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
		byteCursor = pEnd + 2;
	}
	return parts.join("");
}

export function BudProse({
	text,
	formatting,
}: {
	text: string;
	formatting?: FormatSpan[] | null;
}) {
	const html = useMemo(
		() => renderBudBody(text, formatting),
		[text, formatting],
	);

	return (
		<div
			className="story-prose"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: output is sanitized — only emits p, br, strong, em, u, s tags with escaped user text
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
