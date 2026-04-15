import { BUD_WORD_LIMIT, countWords } from "./wordCount.ts";

export const GROWING_MS = 24 * 60 * 60 * 1000;

export type StrongRef = { uri: string; cid: string };

export type FormatSpan = {
	start: number;
	end: number;
	type: "bold" | "italic" | "underline" | "strikethrough";
};

export type BudRecord = {
	title: string;
	text: string;
	parent?: StrongRef;
	createdAt: string;
	formatting?: Array<FormatSpan>;
};

export type ParentLookup = {
	uri: string;
	cid: string;
	authorDid: string;
	createdAt: Date;
};

export type ExistingBud = {
	uri: string;
	authorDid: string;
	createdAt: Date;
	childCount: number;
};

export type ValidationResult<R extends string> =
	| { ok: true }
	| { ok: false; reason: R };

export type BudCreateRejection =
	| "word-limit-exceeded"
	| "parent-required"
	| "parent-not-found"
	| "parent-cid-mismatch"
	| "self-reply"
	| "parent-growing";

export type BudUpdateRejection =
	| "word-limit-exceeded"
	| "bud-not-found"
	| "author-mismatch"
	| "edit-window-closed"
	| "has-children";

export type BudDeleteRejection =
	| "bud-not-found"
	| "author-mismatch"
	| "delete-window-closed"
	| "has-children";

export type PollenRecord = {
	subject: StrongRef;
	createdAt: string;
};

export type SubjectLookup = {
	uri: string;
	cid: string;
	authorDid: string;
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
	isAllowedRoot: boolean;
	now: Date;
};

export function validateBudCreate(
	args: ValidateBudCreateArgs,
): ValidationResult<BudCreateRejection> {
	const { record, authorDid, parent, isAllowedRoot, now } = args;

	if (countWords(record.text) > BUD_WORD_LIMIT) {
		return { ok: false, reason: "word-limit-exceeded" };
	}

	if (!record.parent) {
		return isAllowedRoot
			? { ok: true }
			: { ok: false, reason: "parent-required" };
	}

	if (!parent) {
		return { ok: false, reason: "parent-not-found" };
	}

	if (parent.cid !== record.parent.cid) {
		return { ok: false, reason: "parent-cid-mismatch" };
	}

	if (parent.authorDid === authorDid) {
		return { ok: false, reason: "self-reply" };
	}

	if (now.getTime() - parent.createdAt.getTime() < GROWING_MS) {
		return { ok: false, reason: "parent-growing" };
	}

	return { ok: true };
}

export type ValidateBudUpdateArgs = {
	record: BudRecord;
	authorDid: string;
	existing: ExistingBud | null;
	now: Date;
};

export function validateBudUpdate(
	args: ValidateBudUpdateArgs,
): ValidationResult<BudUpdateRejection> {
	const { record, authorDid, existing, now } = args;

	if (!existing) {
		return { ok: false, reason: "bud-not-found" };
	}

	if (existing.authorDid !== authorDid) {
		return { ok: false, reason: "author-mismatch" };
	}

	if (now.getTime() - existing.createdAt.getTime() >= GROWING_MS) {
		return { ok: false, reason: "edit-window-closed" };
	}

	if (existing.childCount > 0) {
		return { ok: false, reason: "has-children" };
	}

	if (countWords(record.text) > BUD_WORD_LIMIT) {
		return { ok: false, reason: "word-limit-exceeded" };
	}

	return { ok: true };
}

export type ValidateBudDeleteArgs = {
	authorDid: string;
	existing: ExistingBud | null;
	now: Date;
};

export function validateBudDelete(
	args: ValidateBudDeleteArgs,
): ValidationResult<BudDeleteRejection> {
	const { authorDid, existing, now } = args;

	if (!existing) {
		return { ok: false, reason: "bud-not-found" };
	}

	if (existing.authorDid !== authorDid) {
		return { ok: false, reason: "author-mismatch" };
	}

	if (now.getTime() - existing.createdAt.getTime() >= GROWING_MS) {
		return { ok: false, reason: "delete-window-closed" };
	}

	if (existing.childCount > 0) {
		return { ok: false, reason: "has-children" };
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
