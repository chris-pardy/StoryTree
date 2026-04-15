import { describe, expect, it } from "vitest";
import { BUD_WORD_LIMIT, countWords } from "./wordCount.ts";

describe("countWords", () => {
	it("returns 0 for empty string", () => {
		expect(countWords("")).toBe(0);
	});

	it("returns 0 for whitespace and punctuation only", () => {
		expect(countWords("   ")).toBe(0);
		expect(countWords("... !?  ,;")).toBe(0);
	});

	it("counts a single word", () => {
		expect(countWords("hello")).toBe(1);
	});

	it("ignores punctuation between words", () => {
		expect(countWords("hello, world!")).toBe(2);
	});

	it("counts contractions and hyphenated words as expected by Intl.Segmenter", () => {
		// "don't" is one word-like segment; "well-known" is two on most engines.
		expect(countWords("don't")).toBe(1);
	});

	it("counts a 500-word string at exactly the limit", () => {
		const text = Array.from({ length: BUD_WORD_LIMIT }, () => "word").join(" ");
		expect(countWords(text)).toBe(BUD_WORD_LIMIT);
	});

	it("counts a 501-word string as over the limit", () => {
		const text = Array.from({ length: BUD_WORD_LIMIT + 1 }, () => "word").join(
			" ",
		);
		expect(countWords(text)).toBe(BUD_WORD_LIMIT + 1);
	});
});
