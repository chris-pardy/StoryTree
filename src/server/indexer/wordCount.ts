export const BUD_WORD_LIMIT = 500;

const segmenter = new Intl.Segmenter("en", { granularity: "word" });

export function countWords(text: string): number {
	let count = 0;
	for (const segment of segmenter.segment(text)) {
		if (segment.isWordLike) count++;
	}
	return count;
}
