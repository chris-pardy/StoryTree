import { createFileRoute } from "@tanstack/react-router";
import { clientMetadata } from "#/server/auth/client";

export const Route = createFileRoute("/api/client-metadata.json")({
	server: {
		handlers: {
			GET: () =>
				new Response(JSON.stringify(clientMetadata), {
					headers: { "content-type": "application/json" },
				}),
		},
	},
});
