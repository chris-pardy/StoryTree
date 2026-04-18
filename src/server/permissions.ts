import { prisma } from "../db";

export type PermissionFlags = {
	canGrantSeeds: boolean;
	canDeleteBuds: boolean;
	canLockBuds: boolean;
	canGrantPermissions: boolean;
};

const NO_PERMISSIONS: PermissionFlags = {
	canGrantSeeds: false,
	canDeleteBuds: false,
	canLockBuds: false,
	canGrantPermissions: false,
};

/**
 * Returns the full permission flags for a DID, or NO_PERMISSIONS if
 * the DID is null or has no Permission row.
 */
export async function getPermissions(
	did: string | null,
): Promise<PermissionFlags> {
	if (!did) return NO_PERMISSIONS;
	const row = await prisma.permission.findUnique({ where: { did } });
	if (!row) return NO_PERMISSIONS;
	return {
		canGrantSeeds: row.canGrantSeeds,
		canDeleteBuds: row.canDeleteBuds,
		canLockBuds: row.canLockBuds,
		canGrantPermissions: row.canGrantPermissions,
	};
}

/**
 * Single-flag check, useful for server function guards.
 */
export async function hasPermission(
	did: string,
	flag: keyof PermissionFlags,
): Promise<boolean> {
	const row = await prisma.permission.findUnique({
		where: { did },
		select: { [flag]: true },
	});
	return row ? (row as Record<string, boolean>)[flag] === true : false;
}

/**
 * One-time bootstrap: if `BRANCHLINE_ALLOWED_SEED_AUTHORS` is set, ensure
 * each listed DID has a Permission row with all flags enabled. Existing
 * rows are left untouched (`update: {}`) so manual changes aren't clobbered.
 *
 * This is the **only** place the env var is read at runtime. After the
 * first deploy, permissions are managed entirely through the database.
 */
export async function bootstrapPermissions(): Promise<void> {
	const raw = process.env.BRANCHLINE_ALLOWED_SEED_AUTHORS ?? "";
	const dids = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (dids.length === 0) return;

	for (const did of dids) {
		await prisma.permission.upsert({
			where: { did },
			create: {
				did,
				canGrantSeeds: true,
				canDeleteBuds: true,
				canLockBuds: true,
				canGrantPermissions: true,
			},
			update: {},
		});
	}
	console.log(`[permissions] bootstrapped ${dids.length} admin(s) from env`);
}
