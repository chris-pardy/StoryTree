import { createFileRoute } from "@tanstack/react-router";
import { getBranch } from "#/queries/branch.server";

export const Route = createFileRoute("/xrpc/ink.branchline.getBranch")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const bud = url.searchParams.get("bud");
				if (!bud) {
					return new Response(
						JSON.stringify({
							error: "InvalidRequest",
							message: "bud is required",
						}),
						{ status: 400, headers: { "content-type": "application/json" } },
					);
				}
				const result = await getBranch({ bud });
				return new Response(JSON.stringify(result), {
					headers: { "content-type": "application/json" },
				});
			},
		},
	},
});
