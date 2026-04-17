import { createFileRoute } from "@tanstack/react-router";
import { listAuthorBuds } from "#/queries/author-buds.server";

export const Route = createFileRoute("/xrpc/ink.branchline.listAuthorBuds")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const actor = url.searchParams.get("actor");
				if (!actor) {
					return new Response(
						JSON.stringify({
							error: "InvalidRequest",
							message: "actor is required",
						}),
						{ status: 400, headers: { "content-type": "application/json" } },
					);
				}
				const limitStr = url.searchParams.get("limit");
				const limit = limitStr ? Number(limitStr) : undefined;
				const cursor = url.searchParams.get("cursor") ?? undefined;

				const result = await listAuthorBuds({ actor, limit, cursor });
				return new Response(JSON.stringify(result), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
