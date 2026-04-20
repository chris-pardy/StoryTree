import { BUD_WORD_LIMIT, countWords } from "./wordCount.ts";

export const GROWING_MS = 24 * 60 * 60 * 1000;

export type StrongRef = { uri: string; cid: string };

export type FormatSpan = {
	start: number;
	end: number;
	type: "bold" | "italic" | "underline" | "strikethrough";
};

const FORMAT_TYPES = new Set<FormatSpan["type"]>([
	"bold",
	"italic",
	"underline",
	"strikethrough",
]);

const textEncoder = new TextEncoder();

// Spans are byte-offset (UTF-8), end-exclusive, over `text`. Reject anything
// that isn't a proper object with integer bounds inside [0, byteLength(text)]
// and a known `type`. `budToProseMirror` tolerates partial-codepoint coverage
// (it's been written to), so we don't require boundary alignment — just that
// the span physically fits. `null`/undefined/empty array are all valid.
export function validateFormattingSpans(
	text: string,
	formatting: unknown,
): { ok: true } | { ok: false; reason: "invalid-formatting" } {
	if (formatting === undefined || formatting === null) return { ok: true };
	if (!Array.isArray(formatting)) {
		return { ok: false, reason: "invalid-formatting" };
	}
	if (formatting.length === 0) return { ok: true };

	const textByteLen = textEncoder.encode(text).length;
	for (const span of formatting) {
		if (!span || typeof span !== "object") {
			return { ok: false, reason: "invalid-formatting" };
		}
		const { start, end, type } = span as Record<string, unknown>;
		if (
			typeof start !== "number" ||
			typeof end !== "number" ||
			!Number.isInteger(start) ||
			!Number.isInteger(end)
		) {
			return { ok: false, reason: "invalid-formatting" };
		}
		if (start < 0 || end <= start || end > textByteLen) {
			return { ok: false, reason: "invalid-formatting" };
		}
		if (typeof type !== "string" || !FORMAT_TYPES.has(type as FormatSpan["type"])) {
			return { ok: false, reason: "invalid-formatting" };
		}
	}
	return { ok: true };
}

export type BudRecord = {
	title: string;
	text: string;
	parent?: StrongRef;
	createdAt: string;
	formatting?: Array<FormatSpan>;
};

export type BudParentLookup = {
	kind: "bud";
	uri: string;
	cid: string;
	// Null when the parent has been soft-deleted; replies to anonymous buds
	// are still permitted (the tree structure is intact, the byline is just
	// "Anonymous"), so the self-reply check just won't fire.
	authorDid: string | null;
	bloomsAt: Date;
	locked: boolean;
};

export type SeedParentLookup = {
	kind: "seed";
	uri: string;
	cid: string;
	granteeDid: string;
	expiresAt: Date | null;
	// Precomputed at read time by walking `chainUris`: every ancestor exists,
	// none are expired, and at each hop child.authorDid == parent.granteeDid.
	chainValid: boolean;
	// True iff a *different* root bud already references this seed. The indexer
	// excludes the candidate bud's own uri to keep replay idempotent.
	alreadyPlanted: boolean;
};

export type ParentLookup = BudParentLookup | SeedParentLookup;

export type ExistingBud = {
	uri: string;
	authorDid: string | null;
	childCount: number;
	locked: boolean;
};

export type ValidationResult<R extends string> =
	| { ok: true }
	| { ok: false; reason: R };

export type BudCreateRejection =
	| "word-limit-exceeded"
	| "invalid-formatting"
	| "parent-required"
	| "parent-not-found"
	| "parent-cid-mismatch"
	| "self-reply"
	| "parent-locked"
	| "parent-growing"
	| "not-seed-grantee"
	| "seed-expired"
	| "seed-chain-broken"
	| "seed-already-planted";

export type BudUpdateRejection =
	| "word-limit-exceeded"
	| "invalid-formatting"
	| "bud-not-found"
	| "author-mismatch"
	| "has-children"
	| "bud-locked";

export type BudDeleteRejection = "bud-not-found" | "author-mismatch";

export type PollenRecord = {
	subject: StrongRef;
	createdAt: string;
};

export type SubjectLookup = {
	uri: string;
	cid: string;
	// Null after a soft-delete. Self-pollinate then can't fire (null !== did),
	// so anonymous buds remain pollinable.
	authorDid: string | null;
};

export type PollenCreateRejection =
	| "subject-not-found"
	| "subject-cid-mismatch"
	| "self-pollinate"
	| "duplicate-pollen";

export type ValidateBudCreateArgs = {
	record: BudRecord;
	authorDid: string;
	parent: ParentLookup | null;
	now: Date;
};

export function validateBudCreate(
	args: ValidateBudCreateArgs,
): ValidationResult<BudCreateRejection> {
	const { record, authorDid, parent, now } = args;

	if (countWords(record.text) > BUD_WORD_LIMIT) {
		return { ok: false, reason: "word-limit-exceeded" };
	}

	const formatCheck = validateFormattingSpans(record.text, record.formatting);
	if (!formatCheck.ok) return formatCheck;

	if (!record.parent) {
		return { ok: false, reason: "parent-required" };
	}

	if (!parent) {
		return { ok: false, reason: "parent-not-found" };
	}

	if (parent.cid !== record.parent.cid) {
		return { ok: false, reason: "parent-cid-mismatch" };
	}

	if (parent.kind === "bud") {
		if (parent.authorDid === authorDid) {
			return { ok: false, reason: "self-reply" };
		}

		if (parent.locked) {
			return { ok: false, reason: "parent-locked" };
		}

		if (now.getTime() < parent.bloomsAt.getTime()) {
			return { ok: false, reason: "parent-growing" };
		}

		return { ok: true };
	}

	if (parent.granteeDid !== authorDid) {
		return { ok: false, reason: "not-seed-grantee" };
	}

	if (parent.expiresAt && parent.expiresAt.getTime() <= now.getTime()) {
		return { ok: false, reason: "seed-expired" };
	}

	if (!parent.chainValid) {
		return { ok: false, reason: "seed-chain-broken" };
	}

	if (parent.alreadyPlanted) {
		return { ok: false, reason: "seed-already-planted" };
	}

	return { ok: true };
}

export type ValidateBudUpdateArgs = {
	record: BudRecord;
	authorDid: string;
	existing: ExistingBud | null;
};

export function validateBudUpdate(
	args: ValidateBudUpdateArgs,
): ValidationResult<BudUpdateRejection> {
	const { record, authorDid, existing } = args;

	if (!existing) {
		return { ok: false, reason: "bud-not-found" };
	}

	if (existing.authorDid !== authorDid) {
		return { ok: false, reason: "author-mismatch" };
	}

	if (existing.childCount > 0) {
		return { ok: false, reason: "has-children" };
	}

	if (existing.locked) {
		return { ok: false, reason: "bud-locked" };
	}

	if (countWords(record.text) > BUD_WORD_LIMIT) {
		return { ok: false, reason: "word-limit-exceeded" };
	}

	const formatCheck = validateFormattingSpans(record.text, record.formatting);
	if (!formatCheck.ok) return formatCheck;

	return { ok: true };
}

export type ValidateBudDeleteArgs = {
	authorDid: string;
	existing: ExistingBud | null;
};

export function validateBudDelete(
	args: ValidateBudDeleteArgs,
): ValidationResult<BudDeleteRejection> {
	const { authorDid, existing } = args;

	if (!existing) {
		return { ok: false, reason: "bud-not-found" };
	}

	// A nulled authorDid means the bud has already been soft-deleted; treat
	// any further delete as author-mismatch so the same path covers replays.
	if (existing.authorDid !== authorDid) {
		return { ok: false, reason: "author-mismatch" };
	}

	return { ok: true };
}

export type SeedRecord = {
	grantee: string;
	grantor?: string;
	expiresAt?: string;
	createdAt: string;
};

export type GrantorLookup = {
	uri: string;
	granteeDid: string;
	chainUris: Array<string>;
	expiresAt: Date | null;
	hasChild: boolean;
};

export type ExistingSeed = {
	uri: string;
	authorDid: string;
	grantorUri: string | null;
	hasBud: boolean;
};

export type SeedCreateRejection =
	| "grantor-not-found"
	| "not-grantee"
	| "grantor-expired"
	| "grantor-already-granted"
	| "root-not-allowed";

export type SeedUpdateRejection =
	| "seed-not-found"
	| "author-mismatch"
	| "grantor-changed";

export type SeedDeleteRejection =
	| "seed-not-found"
	| "author-mismatch"
	| "seed-planted";

export type ValidateSeedCreateArgs = {
	record: SeedRecord;
	authorDid: string;
	grantor: GrantorLookup | null;
	isAllowedRoot: boolean;
	now: Date;
};

export function validateSeedCreate(
	args: ValidateSeedCreateArgs,
): ValidationResult<SeedCreateRejection> {
	const { record, authorDid, grantor, isAllowedRoot, now } = args;

	if (!record.grantor) {
		return isAllowedRoot
			? { ok: true }
			: { ok: false, reason: "root-not-allowed" };
	}

	if (!grantor) {
		return { ok: false, reason: "grantor-not-found" };
	}

	if (grantor.granteeDid !== authorDid) {
		return { ok: false, reason: "not-grantee" };
	}

	if (grantor.expiresAt && grantor.expiresAt.getTime() <= now.getTime()) {
		return { ok: false, reason: "grantor-expired" };
	}

	if (grantor.hasChild) {
		return { ok: false, reason: "grantor-already-granted" };
	}

	return { ok: true };
}

export type ValidateSeedUpdateArgs = {
	record: SeedRecord;
	authorDid: string;
	existing: ExistingSeed | null;
};

export function validateSeedUpdate(
	args: ValidateSeedUpdateArgs,
): ValidationResult<SeedUpdateRejection> {
	const { record, authorDid, existing } = args;

	if (!existing) {
		return { ok: false, reason: "seed-not-found" };
	}

	if (existing.authorDid !== authorDid) {
		return { ok: false, reason: "author-mismatch" };
	}

	if ((record.grantor ?? null) !== existing.grantorUri) {
		return { ok: false, reason: "grantor-changed" };
	}

	return { ok: true };
}

export type ValidateSeedDeleteArgs = {
	authorDid: string;
	existing: ExistingSeed | null;
};

export function validateSeedDelete(
	args: ValidateSeedDeleteArgs,
): ValidationResult<SeedDeleteRejection> {
	const { authorDid, existing } = args;

	if (!existing) {
		return { ok: false, reason: "seed-not-found" };
	}

	if (existing.authorDid !== authorDid) {
		return { ok: false, reason: "author-mismatch" };
	}

	if (existing.hasBud) {
		return { ok: false, reason: "seed-planted" };
	}

	return { ok: true };
}

export type ValidatePollenCreateArgs = {
	record: PollenRecord;
	authorDid: string;
	subject: SubjectLookup | null;
	hasExistingPollen: boolean;
};

export function validatePollenCreate(
	args: ValidatePollenCreateArgs,
): ValidationResult<PollenCreateRejection> {
	const { record, authorDid, subject, hasExistingPollen } = args;

	if (!subject) {
		return { ok: false, reason: "subject-not-found" };
	}

	if (subject.cid !== record.subject.cid) {
		return { ok: false, reason: "subject-cid-mismatch" };
	}

	if (subject.authorDid === authorDid) {
		return { ok: false, reason: "self-pollinate" };
	}

	if (hasExistingPollen) {
		return { ok: false, reason: "duplicate-pollen" };
	}

	return { ok: true };
}
