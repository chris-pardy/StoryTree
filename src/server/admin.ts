import { createServerFn } from "@tanstack/react-start";
import type { PermissionFlags } from "./permissions";

export type { PermissionFlags };

// Re-export as the old name so existing consumers keep working.
export type AdminPermissions = PermissionFlags;

/**
 * Returns the permission flags for the current session user.
 *
 * This file is a thin fn-wrapper layer imported by client components
 * (e.g. PermissionPanel, useAdminPermissions). The prisma-using impl
 * lives in `./admin.server`, behind a dynamic import inside each
 * handler so the top-level module graph on the client stays free of
 * `@prisma/adapter-pg` and its Node-only `Buffer` usage.
 */
export const checkPermissions = createServerFn({ method: "GET" }).handler(
	async (): Promise<PermissionFlags> => {
		const { checkPermissionsImpl } = await import("./admin.server");
		return checkPermissionsImpl();
	},
);

/**
 * Returns the permission flags for an arbitrary DID.
 * Used by the profile page to render the permission panel.
 */
export const getProfilePermissions = createServerFn({ method: "GET" })
	.inputValidator((args: { did: string }) => args)
	.handler(async ({ data }): Promise<PermissionFlags> => {
		const { getProfilePermissionsImpl } = await import("./admin.server");
		return getProfilePermissionsImpl(data.did);
	});

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
		const { setPermissionImpl } = await import("./admin.server");
		return setPermissionImpl(data);
	});

/**
 * Hard-deletes a bud and every descendant beneath it. Pollen rows
 * cascade via FK. Database-only — no PDS interaction.
 */
export const adminDeleteBud = createServerFn({ method: "POST" })
	.inputValidator((args: { uri: string }) => args)
	.handler(async ({ data }) => {
		const { adminDeleteBudImpl } = await import("./admin.server");
		return adminDeleteBudImpl(data);
	});

/**
 * Toggles the `locked` flag on a bud. A locked bud cannot receive new
 * replies. Database-only — no PDS interaction.
 */
export const adminLockBud = createServerFn({ method: "POST" })
	.inputValidator((args: { uri: string; locked: boolean }) => args)
	.handler(async ({ data }) => {
		const { adminLockBudImpl } = await import("./admin.server");
		return adminLockBudImpl(data);
	});
