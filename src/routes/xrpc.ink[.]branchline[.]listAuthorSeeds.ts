import { createFileRoute } from "@tanstack/react-router";
import { listAuthorSeeds } from "#/queries/author-seeds.server";

export const Route = createFileRoute("/xrpc/ink.branchline.listAuthorSeeds")({
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

				const result = await listAuthorSeeds({ actor, limit, cursor });
				return new Response(JSON.stringify(result), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
