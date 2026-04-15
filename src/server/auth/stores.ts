import type {
	NodeSavedSession,
	NodeSavedSessionStore,
	NodeSavedState,
	NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { prisma } from "#/db";

// The atproto oauth client serializes its state/session blobs and trusts the
// store to round-trip them as JSON. We never look inside.

export const stateStore: NodeSavedStateStore = {
	async get(key) {
		const row = await prisma.authState.findUnique({ where: { key } });
		return row ? (JSON.parse(row.state) as NodeSavedState) : undefined;
	},
	async set(key, state) {
		const value = JSON.stringify(state);
		await prisma.authState.upsert({
			where: { key },
			create: { key, state: value },
			update: { state: value },
		});
	},
	async del(key) {
		await prisma.authState.deleteMany({ where: { key } });
	},
};

export const sessionStore: NodeSavedSessionStore = {
	async get(key) {
		const row = await prisma.authSession.findUnique({ where: { key } });
		return row ? (JSON.parse(row.session) as NodeSavedSession) : undefined;
	},
	async set(key, session) {
		const value = JSON.stringify(session);
		await prisma.authSession.upsert({
			where: { key },
			create: { key, session: value },
			update: { session: value },
		});
	},
	async del(key) {
		await prisma.authSession.deleteMany({ where: { key } });
	},
};
