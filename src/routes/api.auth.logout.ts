import { createFileRoute } from "@tanstack/react-router";
import { getOAuthClient } from "#/server/auth/client";
import {
	buildClearCookie,
	deleteUserSession,
	readSessionId,
} from "#/server/auth/session";

export const Route = createFileRoute("/api/auth/logout")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const sid = readSessionId(request);
				if (sid) {
					const did = await deleteUserSession(sid);
					if (did) {
						try {
							await getOAuthClient().revoke(did);
						} catch (err) {
							console.warn("[auth.logout] revoke failed", err);
						}
					}
				}
				return new Response(null, {
					status: 302,
					headers: {
						Location: "/",
						"Set-Cookie": buildClearCookie(),
					},
				});
			},
		},
	},
});
