import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "#/db";
import { getSessionAgent } from "#/server/auth/session";
import { validatePollenCreate } from "#/server/indexer/validate";

const POLLEN_COLLECTION = "ink.branchline.pollen";

export const Route = createFileRoute("/xrpc/ink.branchline.createPollen")({
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

				const subject = await prisma.bud.findUnique({
					where: { uri: body.subjectUri },
					select: { uri: true, cid: true, authorDid: true },
				});
				if (!subject) {
					return Response.json({ error: "SubjectNotFound" }, { status: 404 });
				}

				const existing = await prisma.pollen.findUnique({
					where: {
						authorDid_subjectUri: {
							authorDid: did,
							subjectUri: subject.uri,
						},
					},
				});

				const now = new Date();
				const record = {
					subject: { uri: subject.uri, cid: subject.cid },
					createdAt: now.toISOString(),
				};

				const check = validatePollenCreate({
					record,
					authorDid: did,
					subject: {
						uri: subject.uri,
						cid: subject.cid,
						authorDid: subject.authorDid,
					},
					hasExistingPollen: existing !== null,
				});
				if (!check.ok) {
					const errorName = rejectionToErrorName(check.reason);
					return Response.json({ error: errorName }, { status: 409 });
				}

				const pdsResp = await agent.com.atproto.repo.createRecord({
					repo: did,
					collection: POLLEN_COLLECTION,
					record: { $type: POLLEN_COLLECTION, ...record },
					validate: false,
				});
				const { uri, cid } = pdsResp.data;

				await prisma.pollen.upsert({
					where: { uri },
					create: {
						uri,
						authorDid: did,
						subjectUri: subject.uri,
						subjectCid: subject.cid,
						createdAt: now,
					},
					update: {},
				});

				return Response.json({ uri, cid });
			},
		},
	},
});

function rejectionToErrorName(reason: string): string {
	switch (reason) {
		case "subject-not-found":
			return "SubjectNotFound";
		case "subject-cid-mismatch":
			return "SubjectCidMismatch";
		case "self-pollinate":
			return "SelfPollinate";
		case "duplicate-pollen":
			return "DuplicatePollen";
		default:
			return reason;
	}
}
