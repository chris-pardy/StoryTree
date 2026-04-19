import { createFileRoute } from "@tanstack/react-router";
import { getOAuthClient } from "#/server/auth/client";
import { isSafeReturnTo } from "#/server/auth/return-to";
import { buildSessionCookie, createUserSession } from "#/server/auth/session";
import { enqueueTargetedReindex } from "#/server/reindex/enqueue";

export const Route = createFileRoute("/api/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				try {
					const { session, state } = await getOAuthClient().callback(
						url.searchParams,
					);
					const sid = await createUserSession(session.did);
					// Opportunistically backfill this user's branchline records.
					// Fire-and-forget so a slow DB write doesn't delay the redirect;
					// enqueueTargetedReindex dedups so returning users don't stack
					// jobs on every login.
					enqueueTargetedReindex(session.did).catch((err) =>
						console.error("[auth.callback] enqueue reindex failed", err),
					);
					// `state` was set by api.auth.login.ts to the user's `returnTo`
					// (already validated at that layer), but re-check here because
					// the OAuth round-trip is untrusted wire data.
					const location =
						typeof state === "string" && isSafeReturnTo(state) ? state : "/";
					return new Response(null, {
						status: 302,
						headers: {
							Location: location,
							"Set-Cookie": buildSessionCookie(sid),
						},
					});
				} catch (err) {
					console.error("[auth.callback] failed", err);
					return new Response(
						`Sign-in failed. ${err instanceof Error ? err.message : ""}`,
						{ status: 400 },
					);
				}
			},
		},
	},
});
