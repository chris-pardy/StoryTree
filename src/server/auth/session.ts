import { randomBytes } from "node:crypto";
import { Agent } from "@atproto/api";
import { prisma } from "#/db";
import { getOAuthClient } from "./client";

const COOKIE_NAME = "branchline_sid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function parseCookies(header: string | null): Record<string, string> {
	if (!header) return {};
	const out: Record<string, string> = {};
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const k = part.slice(0, eq).trim();
		const v = part.slice(eq + 1).trim();
		if (k) out[k] = decodeURIComponent(v);
	}
	return out;
}

export function readSessionId(request: Request): string | undefined {
	return parseCookies(request.headers.get("cookie"))[COOKIE_NAME];
}

export function buildSessionCookie(id: string): string {
	return [
		`${COOKIE_NAME}=${id}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${COOKIE_MAX_AGE}`,
	].join("; ");
}

export function buildClearCookie(): string {
	return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function createUserSession(did: string): Promise<string> {
	const id = randomBytes(32).toString("base64url");
	await prisma.userSession.create({ data: { id, did } });
	return id;
}

export async function deleteUserSession(id: string): Promise<string | null> {
	const row = await prisma.userSession.findUnique({ where: { id } });
	if (!row) return null;
	await prisma.userSession.delete({ where: { id } });
	return row.did;
}

export async function getSessionDid(request: Request): Promise<string | null> {
	const id = readSessionId(request);
	if (!id) return null;
	const row = await prisma.userSession.findUnique({ where: { id } });
	return row?.did ?? null;
}

// Returns an authenticated Agent for outbound writes, or null if there is no
// session. Restoring also refreshes tokens if they are about to expire.
export async function getSessionAgent(
	request: Request,
): Promise<{ agent: Agent; did: string } | null> {
	const did = await getSessionDid(request);
	if (!did) return null;
	try {
		const oauthSession = await getOAuthClient().restore(did);
		return { agent: new Agent(oauthSession), did };
	} catch {
		return null;
	}
}
