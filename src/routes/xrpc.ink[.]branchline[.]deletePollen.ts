import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "#/db";
import { getSessionAgent } from "#/server/auth/session";

const POLLEN_COLLECTION = "ink.branchline.pollen";

export const Route = createFileRoute("/xrpc/ink.branchline.deletePollen")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await getSessionAgent(request);
				if (!session) {
					return Response.json({ error: "Unauthorized" }, { status: 401 });
				}
				const { agent, did } = session;

				const body = await request.json().catch(() => null);
				if (!body?.subjectUri || typeof body.subjectUri !== "string") {
					return Response.json(
						{
							error: "InvalidRequest",
							message: "subjectUri is required",
						},
						{ status: 400 },
					);
				}

				const existing = await prisma.pollen.findUnique({
					where: {
						authorDid_subjectUri: {
							authorDid: did,
							subjectUri: body.subjectUri,
						},
					},
				});
				if (!existing) {
					return Response.json({ error: "PollenNotFound" }, { status: 404 });
				}

				// Extract rkey from the pollen URI (at://did/collection/rkey)
				const rkey = existing.uri.split("/").pop();
				if (!rkey) {
					return Response.json({ error: "InvalidUri" }, { status: 500 });
				}

				await agent.com.atproto.repo.deleteRecord({
					repo: did,
					collection: POLLEN_COLLECTION,
					rkey,
				});

				await prisma.pollen.delete({ where: { uri: existing.uri } });

				return Response.json({ success: true });
			},
		},
	},
});
