import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../db";
import { getSessionDid } from "./auth/session";
import {
	getPermissions,
	hasPermission,
	type PermissionFlags,
} from "./permissions";

const ALLOWED_FLAGS: ReadonlyArray<keyof PermissionFlags> = [
	"canGrantSeeds",
	"canDeleteBuds",
	"canLockBuds",
	"canGrantPermissions",
];

export async function checkPermissionsImpl(): Promise<PermissionFlags> {
	const did = await getSessionDid(getRequest());
	return getPermissions(did);
}

export async function getProfilePermissionsImpl(
	did: string,
): Promise<PermissionFlags> {
	return getPermissions(did);
}

export async function setPermissionImpl(data: {
	did: string;
	flag: keyof PermissionFlags;
	value: boolean;
}): Promise<PermissionFlags> {
	const viewerDid = await getSessionDid(getRequest());
	if (!viewerDid) throw new Error("Unauthorized");
	if (!(await hasPermission(viewerDid, "canGrantPermissions"))) {
		throw new Error("Forbidden");
	}

	if (
		data.did === viewerDid &&
		data.flag === "canGrantPermissions" &&
		!data.value
	) {
		throw new Error("Cannot revoke your own grant-permissions ability");
	}

	if (!ALLOWED_FLAGS.includes(data.flag)) {
		throw new Error("Invalid permission flag");
	}

	await prisma.permission.upsert({
		where: { did: data.did },
		create: { did: data.did, [data.flag]: data.value },
		update: { [data.flag]: data.value },
	});

	return getPermissions(data.did);
}

export async function adminDeleteBudImpl(data: {
	uri: string;
}): Promise<{ deleted: number }> {
	const did = await getSessionDid(getRequest());
	if (!did || !(await hasPermission(did, "canDeleteBuds"))) {
		throw new Error("Forbidden");
	}

	const descendants: { uri: string }[] = await prisma.$queryRaw`
    SELECT uri FROM "Bud"
    WHERE ${data.uri} = ANY("pathUris")
    ORDER BY depth DESC
  `;

	const uris = descendants.map((r) => r.uri);
	if (uris.length === 0) return { deleted: 0 };

	await prisma.$transaction(async (tx) => {
		await tx.pollen.deleteMany({ where: { subjectUri: { in: uris } } });
		await tx.bud.deleteMany({ where: { uri: { in: uris } } });
	});

	return { deleted: uris.length };
}

export async function adminLockBudImpl(data: {
	uri: string;
	locked: boolean;
}): Promise<{ uri: string; locked: boolean }> {
	const did = await getSessionDid(getRequest());
	if (!did || !(await hasPermission(did, "canLockBuds"))) {
		throw new Error("Forbidden");
	}

	await prisma.bud.update({
		where: { uri: data.uri },
		data: { locked: data.locked },
	});

	return { uri: data.uri, locked: data.locked };
}
