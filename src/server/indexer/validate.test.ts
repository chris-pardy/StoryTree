import { describe, expect, it } from "vitest";
import {
	type BudRecord,
	type ExistingBud,
	type ExistingSeed,
	type GrantorLookup,
	type ParentLookup,
	type PollenRecord,
	type SeedRecord,
	type SubjectLookup,
	type ValidateBudCreateArgs,
	type ValidateSeedCreateArgs,
	validateBudCreate,
	validateBudDelete,
	validateBudUpdate,
	validatePollenCreate,
	validateSeedCreate,
	validateSeedDelete,
	validateSeedUpdate,
} from "./validate.ts";
import { BUD_WORD_LIMIT } from "./wordCount.ts";

const NOW = new Date("2026-04-14T12:00:00Z");
const AUTHOR = "did:plc:author";
const OTHER = "did:plc:other";

const parentRow: ParentLookup = {
	kind: "bud",
	uri: "at://did:plc:other/ink.branchline.bud/parent1",
	cid: "bafyparent",
	authorDid: OTHER,
	bloomsAt: new Date(NOW.getTime() - 1000),
	locked: false,
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
	now: NOW,
};

const SEED_PARENT_URI = "at://did:plc:other/ink.branchline.seed/grant1";

const seedParentRow: ParentLookup = {
	kind: "seed",
	uri: SEED_PARENT_URI,
	cid: "bafyseed",
	granteeDid: AUTHOR,
	expiresAt: null,
	chainValid: true,
	alreadyPlanted: false,
};

const rootBudRecord: BudRecord = {
	title: "Root",
	text: "a brand new story root",
	parent: { uri: SEED_PARENT_URI, cid: "bafyseed" },
	createdAt: NOW.toISOString(),
};

const baseSeedArgs: ValidateBudCreateArgs = {
	record: rootBudRecord,
	authorDid: AUTHOR,
	parent: seedParentRow,
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
					authorDid: OTHER,
				}),
			).toEqual({ ok: false, reason: "self-reply" });
		});

		it("rejects a bud when the parent is locked", () => {
			const lockedParent: ParentLookup = {
				...parentRow,
				locked: true,
			};
			expect(validateBudCreate({ ...baseArgs, parent: lockedParent })).toEqual({
				ok: false,
				reason: "parent-locked",
			});
		});

		it("rejects a bud when the parent has not yet bloomed", () => {
			const freshParent: ParentLookup = {
				...parentRow,
				bloomsAt: new Date(NOW.getTime() + 1),
			};
			expect(validateBudCreate({ ...baseArgs, parent: freshParent })).toEqual({
				ok: false,
				reason: "parent-growing",
			});
		});

		it("accepts a bud whose parent has exactly reached bloomsAt", () => {
			const boundaryParent: ParentLookup = {
				...parentRow,
				bloomsAt: new Date(NOW.getTime()),
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

	describe("parentless buds", () => {
		it("rejects a bud with no parent strongRef", () => {
			expect(
				validateBudCreate({
					...baseArgs,
					record: {
						title: "Orphan",
						text: "no parent at all",
						createdAt: NOW.toISOString(),
					},
					parent: null,
				}),
			).toEqual({ ok: false, reason: "parent-required" });
		});
	});

	describe("seed parents", () => {
		it("accepts a root bud whose parent is a valid seed granted to the author", () => {
			expect(validateBudCreate(baseSeedArgs)).toEqual({ ok: true });
		});

		it("rejects a root bud whose seed parent is unknown", () => {
			expect(validateBudCreate({ ...baseSeedArgs, parent: null })).toEqual({
				ok: false,
				reason: "parent-not-found",
			});
		});

		it("rejects when the strongRef cid does not match the indexed seed", () => {
			expect(
				validateBudCreate({
					...baseSeedArgs,
					record: {
						...rootBudRecord,
						parent: { uri: SEED_PARENT_URI, cid: "bafySTALE" },
					},
				}),
			).toEqual({ ok: false, reason: "parent-cid-mismatch" });
		});

		it("rejects when the bud author is not the seed's grantee", () => {
			expect(validateBudCreate({ ...baseSeedArgs, authorDid: OTHER })).toEqual({
				ok: false,
				reason: "not-seed-grantee",
			});
		});

		it("rejects when the seed has already expired", () => {
			expect(
				validateBudCreate({
					...baseSeedArgs,
					parent: {
						...seedParentRow,
						expiresAt: new Date(NOW.getTime() - 1),
					},
				}),
			).toEqual({ ok: false, reason: "seed-expired" });
		});

		it("rejects when the seed chain is broken upstream", () => {
			expect(
				validateBudCreate({
					...baseSeedArgs,
					parent: { ...seedParentRow, chainValid: false },
				}),
			).toEqual({ ok: false, reason: "seed-chain-broken" });
		});

		it("rejects when another root bud already references the seed", () => {
			expect(
				validateBudCreate({
					...baseSeedArgs,
					parent: { ...seedParentRow, alreadyPlanted: true },
				}),
			).toEqual({ ok: false, reason: "seed-already-planted" });
		});
	});
});

const BUD_URI = "at://did:plc:author/ink.branchline.bud/abc";

const existingFresh: ExistingBud = {
	uri: BUD_URI,
	authorDid: AUTHOR,
	childCount: 0,
};

const updatedRecord: BudRecord = {
	title: "Edited",
	text: "a slightly revised version of the bud body",
	createdAt: NOW.toISOString(),
};

describe("validateBudUpdate", () => {
	it("accepts an edit by the original author with no descendants", () => {
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: AUTHOR,
				existing: existingFresh,
			}),
		).toEqual({ ok: true });
	});

	it("rejects when the record has not been seen before", () => {
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: AUTHOR,
				existing: null,
			}),
		).toEqual({ ok: false, reason: "bud-not-found" });
	});

	it("rejects when the event author is not the original author", () => {
		expect(
			validateBudUpdate({
				record: updatedRecord,
				authorDid: OTHER,
				existing: existingFresh,
			}),
		).toEqual({ ok: false, reason: "author-mismatch" });
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
			}),
		).toEqual({ ok: false, reason: "word-limit-exceeded" });
	});
});

describe("validateBudDelete", () => {
	it("accepts a delete by the original author with no descendants", () => {
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: existingFresh,
			}),
		).toEqual({ ok: true });
	});

	it("rejects when the record has not been seen before", () => {
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: null,
			}),
		).toEqual({ ok: false, reason: "bud-not-found" });
	});

	it("rejects when the event author is not the original author", () => {
		expect(
			validateBudDelete({
				authorDid: OTHER,
				existing: existingFresh,
			}),
		).toEqual({ ok: false, reason: "author-mismatch" });
	});

	it("accepts a delete even when descendants already exist (soft-delete path)", () => {
		const withChildren: ExistingBud = {
			...existingFresh,
			childCount: 1,
		};
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: withChildren,
			}),
		).toEqual({ ok: true });
	});

	it("rejects a delete on an already-soft-deleted bud", () => {
		const anonymized: ExistingBud = {
			...existingFresh,
			authorDid: null,
		};
		expect(
			validateBudDelete({
				authorDid: AUTHOR,
				existing: anonymized,
			}),
		).toEqual({ ok: false, reason: "author-mismatch" });
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
				authorDid: OTHER,
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

const ROOT_SEED_URI = "at://did:plc:branchline/ink.branchline.seed/root1";
const ALICE = "did:plc:alice";
const BOB = "did:plc:bob";

const grantorRow: GrantorLookup = {
	uri: ROOT_SEED_URI,
	granteeDid: ALICE,
	chainUris: [ROOT_SEED_URI],
	expiresAt: null,
	hasChild: false,
};

const subgrantRecord: SeedRecord = {
	grantee: BOB,
	grantor: ROOT_SEED_URI,
	createdAt: NOW.toISOString(),
};

const baseSeedCreateArgs: ValidateSeedCreateArgs = {
	record: subgrantRecord,
	authorDid: ALICE,
	grantor: grantorRow,
	isAllowedRoot: false,
	now: NOW,
};

describe("validateSeedCreate", () => {
	it("accepts the happy path (grantee chaining from their own grant)", () => {
		expect(validateSeedCreate(baseSeedCreateArgs)).toEqual({ ok: true });
	});

	it("rejects when the grantor is not in the index", () => {
		expect(
			validateSeedCreate({ ...baseSeedCreateArgs, grantor: null }),
		).toEqual({ ok: false, reason: "grantor-not-found" });
	});

	it("rejects when the author is not the grantee of the named grantor", () => {
		expect(
			validateSeedCreate({ ...baseSeedCreateArgs, authorDid: BOB }),
		).toEqual({ ok: false, reason: "not-grantee" });
	});

	it("rejects when the grantor has already expired", () => {
		const expired: GrantorLookup = {
			...grantorRow,
			expiresAt: new Date(NOW.getTime() - 1),
		};
		expect(
			validateSeedCreate({ ...baseSeedCreateArgs, grantor: expired }),
		).toEqual({ ok: false, reason: "grantor-expired" });
	});

	it("rejects when the grantor expires exactly at now (boundary)", () => {
		const boundary: GrantorLookup = {
			...grantorRow,
			expiresAt: new Date(NOW.getTime()),
		};
		expect(
			validateSeedCreate({ ...baseSeedCreateArgs, grantor: boundary }),
		).toEqual({ ok: false, reason: "grantor-expired" });
	});

	it("rejects when the grantor already has an active child", () => {
		expect(
			validateSeedCreate({
				...baseSeedCreateArgs,
				grantor: { ...grantorRow, hasChild: true },
			}),
		).toEqual({ ok: false, reason: "grantor-already-granted" });
	});

	describe("root seeds", () => {
		const rootRecord: SeedRecord = {
			grantee: ALICE,
			createdAt: NOW.toISOString(),
		};

		it("accepts a grantor-less seed from an allow-listed author", () => {
			expect(
				validateSeedCreate({
					...baseSeedCreateArgs,
					record: rootRecord,
					grantor: null,
					isAllowedRoot: true,
				}),
			).toEqual({ ok: true });
		});

		it("rejects a grantor-less seed from a non-allow-listed author", () => {
			expect(
				validateSeedCreate({
					...baseSeedCreateArgs,
					record: rootRecord,
					grantor: null,
					isAllowedRoot: false,
				}),
			).toEqual({ ok: false, reason: "root-not-allowed" });
		});
	});
});

const SEED_URI = "at://did:plc:alice/ink.branchline.seed/mine";

const existingSeed: ExistingSeed = {
	uri: SEED_URI,
	authorDid: ALICE,
	grantorUri: ROOT_SEED_URI,
	hasBud: false,
};

describe("validateSeedUpdate", () => {
	it("accepts a same-author update that preserves grantor", () => {
		expect(
			validateSeedUpdate({
				record: subgrantRecord,
				authorDid: ALICE,
				existing: existingSeed,
			}),
		).toEqual({ ok: true });
	});

	it("rejects when the record has not been seen before", () => {
		expect(
			validateSeedUpdate({
				record: subgrantRecord,
				authorDid: ALICE,
				existing: null,
			}),
		).toEqual({ ok: false, reason: "seed-not-found" });
	});

	it("rejects when the event author is not the original author", () => {
		expect(
			validateSeedUpdate({
				record: subgrantRecord,
				authorDid: BOB,
				existing: existingSeed,
			}),
		).toEqual({ ok: false, reason: "author-mismatch" });
	});

	it("rejects when the update moves the seed to a different grantor", () => {
		expect(
			validateSeedUpdate({
				record: {
					...subgrantRecord,
					grantor: "at://did:plc:other/ink.branchline.seed/elsewhere",
				},
				authorDid: ALICE,
				existing: existingSeed,
			}),
		).toEqual({ ok: false, reason: "grantor-changed" });
	});

	it("rejects when the update drops the grantor on a chained seed", () => {
		expect(
			validateSeedUpdate({
				record: { ...subgrantRecord, grantor: undefined },
				authorDid: ALICE,
				existing: existingSeed,
			}),
		).toEqual({ ok: false, reason: "grantor-changed" });
	});
});

describe("validateSeedDelete", () => {
	it("accepts an own-author delete on an unplanted seed", () => {
		expect(
			validateSeedDelete({ authorDid: ALICE, existing: existingSeed }),
		).toEqual({ ok: true });
	});

	it("rejects when the record has not been seen before", () => {
		expect(validateSeedDelete({ authorDid: ALICE, existing: null })).toEqual({
			ok: false,
			reason: "seed-not-found",
		});
	});

	it("rejects when the event author is not the original author", () => {
		expect(
			validateSeedDelete({ authorDid: BOB, existing: existingSeed }),
		).toEqual({ ok: false, reason: "author-mismatch" });
	});

	it("rejects when the seed has already been used to plant a bud", () => {
		expect(
			validateSeedDelete({
				authorDid: ALICE,
				existing: { ...existingSeed, hasBud: true },
			}),
		).toEqual({ ok: false, reason: "seed-planted" });
	});
});
