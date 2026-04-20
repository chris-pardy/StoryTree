import { createFileRoute } from "@tanstack/react-router";
import { getSessionDid } from "#/server/auth/session";
import { listNotifications } from "#/server/notifications/list";

export const Route = createFileRoute("/xrpc/ink.branchline.listNotifications")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const viewerDid = await getSessionDid(request);
				if (!viewerDid) {
					return Response.json({ error: "Unauthorized" }, { status: 401 });
				}

				const url = new URL(request.url);
				const seenAtRaw = url.searchParams.get("seenAt");
				const seenAt = seenAtRaw ? new Date(seenAtRaw) : undefined;
				if (seenAt && Number.isNaN(seenAt.getTime())) {
					return Response.json(
						{ error: "InvalidRequest", message: "seenAt must be ISO datetime" },
						{ status: 400 },
					);
				}
				const limitStr = url.searchParams.get("limit");
				const limit = limitStr ? Number(limitStr) : undefined;

				const result = await listNotifications({ viewerDid, seenAt, limit });
				return Response.json(result);
			},
		},
	},
});
