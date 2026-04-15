import { describe, expect, it } from "vitest";
import {
	type BudRecord,
	type ExistingBud,
	GROWING_MS,
	type ParentLookup,
	type PollenRecord,
	type SubjectLookup,
	type ValidateBudCreateArgs,
	validateBudCreate,
	validateBudDelete,
	validateBudUpdate,
	validatePollenCreate,
} from "./validate.ts";
import { BUD_WORD_LIMIT } from "./wordCount.ts";

const NOW = new Date("2026-04-14T12:00:00Z");
const AUTHOR = "did:plc:author";
const OTHER = "did:plc:other";

const parentRow: ParentLookup = {
	uri: "at://did:plc:other/ink.branchline.bud/parent1",
	cid: "bafyparent",
	authorDid: OTHER,
	createdAt: new Date(NOW.getTime() - GROWING_MS - 1000),
};

const childRecord: BudRecord = {
	title: "Child",
	text: "a child bud that builds on the parent",
	parent: { uri: parentRow.uri, cid: parentRow.cid },
	createdAt: NOW.toISOString(),
};

const baseArgs: ValidateBudCreateArgs = {
	record: childRecord,
	authorDid: AUTHOR,
	parent: parentRow,
	isAllowedRoot: false,
	now: NOW,
};

describe("validateBudCreate", () => {
	describe("word limit", () => {
		it("accepts text at exactly the 500-word limit", () => {
			const text = Array.from({ length: BUD_WORD_LIMIT }, () => "word").join(
				" ",
			);
			expect(
				validateBudCreate({ ...baseArgs, record: { ...childRecord, text } }),
			).toEqual({ ok: true });
		});

		it("rejects text over the 500-word limit", () => {
			const text = Array.from(
				{ length: BUD_WORD_LIMIT + 1 },
				() => "word",
			).join(" ");
			expect(
				validateBudCreate({ ...baseArgs, record: { ...childRecord, text } }),
			).toEqual({ ok: false, reason: "word-limit-exceeded" });
		});
	});

	describe("parent presence", () => {
		it("rejects a bud whose parent ref points at a bud not in the index", () => {
			expect(validateBudCreate({ ...baseArgs, parent: null })).toEqual({
				ok: false,
				reason: "parent-not-found",
			});
		});

		it("rejects a bud whose parent CID does not match the indexed parent", () => {
			expect(
				validateBudCreate({
					...baseArgs,
					record: {
						...childRecord,
						parent: { uri: parentRow.uri, cid: "bafySTALE" },
					},
				}),
			).toEqual({ ok: false, reason: "parent-cid-mismatch" });
		});
	});

	describe("extension rules", () => {
		it("rejects a bud whose author equals the parent author (self-reply)", () => {
			expect(
				validateBudCreate({
					...baseArgs,
					authorDid: parentRow.authorDid,
				}),
			).toEqual({ ok: false, reason: "self-reply" });
		});

		it("rejects a bud when the parent is still inside the 24h growing window", () => {
			const freshParent: ParentLookup = {
				...parentRow,
				createdAt: new Date(NOW.getTime() - GROWING_MS + 1),
			};
			expect(validateBudCreate({ ...baseArgs, parent: freshParent })).toEqual({
				ok: false,
				reason: "parent-growing",
			});
		});

		it("accepts a bud whose parent is exactly 24h old", () => {
			const boundaryParent: ParentLookup = {
				...parentRow,
				createdAt: new Date(NOW.getTime() - GROWING_MS),
			};
			expect(
				validateBudCreate({ ...baseArgs, parent: boundaryParent }),
			).toEqual({
				ok: true,
			});
		});

		it("accepts the happy path (different author, parent past growing window, in-limit text)", () => {
			expect(validateBudCreate(baseArgs)).toEqual({ ok: true });
		});
	});

	describe("root records", () => {
		const rootRecord: BudRecord = {
			title: "Root",
			text: "a brand new story root",
			createdAt: NOW.toISOString(),
		};

		it("rejects a parentless bud that is not on the curated allow-list", () => {
			expect(
				validateBudCreate({
					...baseArgs,
					record: rootRecord,
					parent: null,
					isAllowedRoot: false,
				}),
			).toEqual({ ok: false, reason: "parent-required" });
		});

		it("accepts a parentless bud whose AT-URI is on the curated allow-list", () => {
			expect(
				validateBudCreate({
					...baseArgs,
					record: rootRecord,
					parent: null,
					isAllowedRoot: true,
				}),
			).toEqual({ ok: true });
		});
	});
});

const BUD_URI = "at://did:plc:author/ink.branchline.bud/abc";

const existingFresh: ExistingBud = {
	uri: BUD_URI,
	authorDid: AUTHOR,
	createdAt: new Date(NOW.getTime() - 1000),
	childCount: 0,
};

const updatedRecord: BudRecord = {
	title: "Edited",
	text: "a slightly revised version of the bud body",
	createdAt: NOW.toISOString(),
};

describe("validateBudUpdate", () => {
	it("accepts an in-window edit by the original author", () => {
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: AUTHOR,
				existing: existingFresh,
				now: NOW,
			}),
		).toEqual({ ok: true });
	});

	it("rejects when the record has not been seen before", () => {
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: AUTHOR,
				existing: null,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "bud-not-found" });
	});

	it("rejects when the event author is not the original author", () => {
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: OTHER,
				existing: existingFresh,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "author-mismatch" });
	});

	it("rejects an edit at exactly 24h after createdAt (window closed)", () => {
		const expired: ExistingBud = {
			...existingFresh,
			createdAt: new Date(NOW.getTime() - GROWING_MS),
		};
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: AUTHOR,
				existing: expired,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "edit-window-closed" });
	});

	it("rejects an edit when descendants already exist", () => {
		const withChildren: ExistingBud = {
			...existingFresh,
			childCount: 1,
		};
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: AUTHOR,
				existing: withChildren,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "has-children" });
	});

	it("rejects an edit whose new text exceeds the 500-word limit", () => {
		const tooLong = Array.from(
			{ length: BUD_WORD_LIMIT + 1 },
			() => "word",
		).join(" ");
		expect(
			validateBudUpdate({
				record: { ...updatedRecord, text: tooLong },
				authorDid: AUTHOR,
				existing: existingFresh,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "word-limit-exceeded" });
	});
});

describe("validateBudDelete", () => {
	it("accepts an in-window delete by the original author", () => {
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: existingFresh,
				now: NOW,
			}),
		).toEqual({ ok: true });
	});

	it("rejects when the record has not been seen before", () => {
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: null,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "bud-not-found" });
	});

	it("rejects when the event author is not the original author", () => {
		expect(
			validateBudDelete({
				authorDid: OTHER,
				existing: existingFresh,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "author-mismatch" });
	});

	it("rejects a delete at exactly 24h after createdAt (window closed)", () => {
		const expired: ExistingBud = {
			...existingFresh,
			createdAt: new Date(NOW.getTime() - GROWING_MS),
		};
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: expired,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "delete-window-closed" });
	});

	it("rejects a delete when descendants already exist", () => {
		const withChildren: ExistingBud = {
			...existingFresh,
			childCount: 1,
		};
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: withChildren,
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "has-children" });
	});
});

const POLLEN_SUBJECT_URI = "at://did:plc:other/ink.branchline.bud/target";

const subjectRow: SubjectLookup = {
	uri: POLLEN_SUBJECT_URI,
	cid: "bafysubject",
	authorDid: OTHER,
};

const pollenRecord: PollenRecord = {
	subject: { uri: POLLEN_SUBJECT_URI, cid: "bafysubject" },
	createdAt: NOW.toISOString(),
};

describe("validatePollenCreate", () => {
	it("accepts the happy path (other author, matching cid, no prior pollen)", () => {
		expect(
			validatePollenCreate({
				record: pollenRecord,
				authorDid: AUTHOR,
				subject: subjectRow,
				hasExistingPollen: false,
			}),
		).toEqual({ ok: true });
	});

	it("rejects when the subject bud is not in the index", () => {
		expect(
			validatePollenCreate({
				record: pollenRecord,
				authorDid: AUTHOR,
				subject: null,
				hasExistingPollen: false,
			}),
		).toEqual({ ok: false, reason: "subject-not-found" });
	});

	it("rejects when the pollen strongRef cid does not match the indexed subject cid", () => {
		expect(
			validatePollenCreate({
				record: {
					...pollenRecord,
					subject: { uri: POLLEN_SUBJECT_URI, cid: "bafySTALE" },
				},
				authorDid: AUTHOR,
				subject: subjectRow,
				hasExistingPollen: false,
			}),
		).toEqual({ ok: false, reason: "subject-cid-mismatch" });
	});

	it("rejects when the author tries to pollinate their own bud", () => {
		expect(
			validatePollenCreate({
				record: pollenRecord,
				authorDid: subjectRow.authorDid,
				subject: subjectRow,
				hasExistingPollen: false,
			}),
		).toEqual({ ok: false, reason: "self-pollinate" });
	});

	it("rejects when the author already has pollen on this subject", () => {
		expect(
			validatePollenCreate({
				record: pollenRecord,
				authorDid: AUTHOR,
				subject: subjectRow,
				hasExistingPollen: true,
			}),
		).toEqual({ ok: false, reason: "duplicate-pollen" });
	});
});
