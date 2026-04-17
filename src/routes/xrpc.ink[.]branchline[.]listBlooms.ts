import { createFileRoute } from "@tanstack/react-router";
import { listBlooms } from "#/queries/blooms.server";

export const Route = createFileRoute("/xrpc/ink.branchline.listBlooms")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const sort = (url.searchParams.get("sort") ?? undefined) as
					| "recent"
					| "pollen"
					| undefined;
				const limitStr = url.searchParams.get("limit");
				const limit = limitStr ? Number(limitStr) : undefined;
				const cursor = url.searchParams.get("cursor") ?? undefined;

				const result = await listBlooms({ sort, limit, cursor });
				return new Response(JSON.stringify(result), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
