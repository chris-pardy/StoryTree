import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { FormatSpan } from "../indexer/validate";

// Mirrors `ink.branchline.editBud` input schema. Kept inline (not imported
// from the generated lexicon) to avoid pulling the generated tree into the
// type-check graph; the JSON lexicon remains the source of truth and
// `pnpm lex:gen` still produces client types for external callers.
export type EditBudInput = {
	uri: string;
	title: string;
	text: string;
	formatting?: Array<FormatSpan>;
};

export type EditBudOutput = {
	uri: string;
	cid: string;
};

/**
 * AppView-side implementation of `ink.branchline.editBud` exposed as a
 * TanStack Start server function for the first-party UI. The public XRPC
 * handler at `/xrpc/ink.branchline.editBud` wraps the same `performEditBud`.
 *
 * This file is imported by client components (`components/reading/Bud.tsx`
 * calls `editBud()`), so prisma-using logic lives behind a dynamic import
 * in `./edit.server` — keeps `@prisma/adapter-pg` (and its Node-only
 * `Buffer` usage) out of the client module graph.
 */
export const editBud = createServerFn({ method: "POST" })
	.inputValidator((args: EditBudInput) => args)
	.handler(async ({ data }): Promise<EditBudOutput> => {
		const { getSessionAgent } = await import("../auth/session");
		const { performEditBud } = await import("./edit.server");

		const session = await getSessionAgent(getRequest());
		if (!session) {
			throw new Error("Unauthorized");
		}

		return performEditBud({
			agent: session.agent,
			did: session.did,
			input: data,
		});
	});

export function rejectionToErrorName(reason: string): string {
	switch (reason) {
		case "word-limit-exceeded":
			return "WordLimitExceeded";
		case "invalid-formatting":
			return "InvalidFormatting";
		case "bud-not-found":
			return "BudNotFound";
		case "author-mismatch":
			return "NotOwner";
		case "has-children":
			return "BudHasChildren";
		case "bud-locked":
			return "BudLocked";
		default:
			return reason;
	}
}
