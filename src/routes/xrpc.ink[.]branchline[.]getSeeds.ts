import { createFileRoute } from "@tanstack/react-router";
import { getSeeds } from "#/queries/seeds.server";

export const Route = createFileRoute("/xrpc/ink.branchline.getSeeds")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const uris = url.searchParams.getAll("uris");
				if (uris.length === 0) {
					return new Response(
						JSON.stringify({
							error: "InvalidRequest",
							message: "uris is required",
						}),
						{ status: 400, headers: { "content-type": "application/json" } },
					);
				}

				const result = await getSeeds({ uris });
				return new Response(JSON.stringify(result), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
