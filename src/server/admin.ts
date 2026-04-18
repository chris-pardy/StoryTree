import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "../db";
import { getSessionDid } from "./auth/session";
import {
	getPermissions,
	hasPermission,
	type PermissionFlags,
} from "./permissions";

export type { PermissionFlags };

// Re-export as the old name so existing consumers keep working.
export type AdminPermissions = PermissionFlags;

/**
 * Returns the permission flags for the current session user.
 */
export const checkPermissions = createServerFn({ method: "GET" }).handler(
	async (): Promise<PermissionFlags> => {
		const did = await getSessionDid(getRequest());
		return getPermissions(did);
	},
);

/**
 * Returns the permission flags for an arbitrary DID.
 * Used by the profile page to render the permission panel.
 */
export const getProfilePermissions = createServerFn({ method: "GET" })
	.inputValidator((args: { did: string }) => args)
	.handler(async ({ data }): Promise<PermissionFlags> => {
		return getPermissions(data.did);
	});

const ALLOWED_FLAGS: ReadonlyArray<keyof PermissionFlags> = [
	"canGrantSeeds",
	"canDeleteBuds",
	"canLockBuds",
	"canGrantPermissions",
];

/**
 * Sets a single permission flag for a DID. The caller must have
 * `canGrantPermissions`. Revoking your own `canGrantPermissions` is
 * blocked to prevent deadlock (no one left who can grant).
 */
export const setPermission = createServerFn({ method: "POST" })
	.inputValidator(
		(args: { did: string; flag: keyof PermissionFlags; value: boolean }) =>
			args,
	)
	.handler(async ({ data }): Promise<PermissionFlags> => {
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
	});

/**
 * Hard-deletes a bud and every descendant beneath it. Pollen rows
 * cascade via FK. Database-only — no PDS interaction.
 */
export const adminDeleteBud = createServerFn({ method: "POST" })
	.inputValidator((args: { uri: string }) => args)
	.handler(async ({ data }) => {
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
	});

/**
 * Toggles the `locked` flag on a bud. A locked bud cannot receive new
 * replies. Database-only — no PDS interaction.
 */
export const adminLockBud = createServerFn({ method: "POST" })
	.inputValidator((args: { uri: string; locked: boolean }) => args)
	.handler(async ({ data }) => {
		const did = await getSessionDid(getRequest());
		if (!did || !(await hasPermission(did, "canLockBuds"))) {
			throw new Error("Forbidden");
		}

		await prisma.bud.update({
			where: { uri: data.uri },
			data: { locked: data.locked },
		});

		return { uri: data.uri, locked: data.locked };
	});
