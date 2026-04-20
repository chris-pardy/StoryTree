import { createFileRoute } from "@tanstack/react-router";
import type { EditBudInput } from "#/server/buds/edit";

// Map error names thrown by `performEditBud` to HTTP status codes. Keep this
// table aligned with the `errors` array in
// `lexicons/ink/branchline/editBud.json`. Anything not listed falls back to 500.
const ERROR_STATUS: Record<string, number> = {
	BudNotFound: 404,
	NotOwner: 403,
	BudHasChildren: 409,
	BudLocked: 409,
	WordLimitExceeded: 409,
	InvalidFormatting: 400,
};

export const Route = createFileRoute("/xrpc/ink.branchline.editBud")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const [{ getSessionAgent }, { performEditBud }] = await Promise.all([
					import("#/server/auth/session"),
					import("#/server/buds/edit.server"),
				]);

				const session = await getSessionAgent(request);
				if (!session) {
					return Response.json({ error: "Unauthorized" }, { status: 401 });
				}

				const body = (await request.json().catch(() => null)) as {
					uri?: unknown;
					title?: unknown;
					text?: unknown;
					formatting?: unknown;
				} | null;
				if (
					!body ||
					typeof body.uri !== "string" ||
					typeof body.title !== "string" ||
					typeof body.text !== "string"
				) {
					return Response.json(
						{
							error: "InvalidRequest",
							message: "uri, title, and text are required",
						},
						{ status: 400 },
					);
				}

				// Shape-check only — `performEditBud` runs span contents through
				// `validateFormattingSpans`, which rejects bad offsets / unknown
				// types as `InvalidFormatting`.
				const input: EditBudInput = {
					uri: body.uri,
					title: body.title,
					text: body.text,
					formatting: Array.isArray(body.formatting)
						? (body.formatting as EditBudInput["formatting"])
						: undefined,
				};

				try {
					const result = await performEditBud({
						agent: session.agent,
						did: session.did,
						input,
					});
					return Response.json(result);
				} catch (err) {
					const name = err instanceof Error ? err.message : "InternalError";
					const status = ERROR_STATUS[name] ?? 500;
					return Response.json({ error: name }, { status });
				}
			},
		},
	},
});
