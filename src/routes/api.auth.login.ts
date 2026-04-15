import { createFileRoute } from "@tanstack/react-router";
import { getOAuthClient, SCOPE } from "#/server/auth/client";
import { isSafeReturnTo } from "#/server/auth/return-to";

export const Route = createFileRoute("/api/auth/login")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const form = await request.formData();
				const handle = String(form.get("handle") ?? "").trim();
				if (!handle) {
					return new Response("handle required", { status: 400 });
				}
				// Forward the user's intended destination through the OAuth `state`
				// parameter; `@atproto/oauth-client-node` round-trips it verbatim
				// back into the callback. Unsafe values (off-origin, protocol-
				// relative, control chars) are dropped on the way in so the
				// callback can trust whatever comes out.
				const rawReturnTo = form.get("returnTo");
				const returnTo =
					typeof rawReturnTo === "string" && isSafeReturnTo(rawReturnTo)
						? rawReturnTo
						: undefined;
				try {
					const url = await getOAuthClient().authorize(handle, {
						scope: SCOPE,
						state: returnTo,
					});
					return new Response(null, {
						status: 302,
						headers: { Location: url.toString() },
					});
				} catch (err) {
					console.error("[auth.login] authorize failed", err);
					return new Response(
						`Could not start sign-in for "${handle}". ${
							err instanceof Error ? err.message : ""
						}`,
						{ status: 400 },
					);
				}
			},
		},
	},
});
