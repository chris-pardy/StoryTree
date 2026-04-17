import { createFileRoute } from "@tanstack/react-router";
import { getBuds } from "#/queries/buds.server";
import { getSessionDid } from "#/server/auth/session";

export const Route = createFileRoute("/xrpc/ink.branchline.getBuds")({
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

				const viewerDid = await getSessionDid(request);
				const result = await getBuds({ uris }, viewerDid);
				return new Response(JSON.stringify(result), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
