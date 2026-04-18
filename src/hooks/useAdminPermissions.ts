import { useQuery } from "@tanstack/react-query";
import { checkPermissions, type PermissionFlags } from "#/server/admin";

const NO_PERMISSIONS: PermissionFlags = {
	canGrantSeeds: false,
	canDeleteBuds: false,
	canLockBuds: false,
	canGrantPermissions: false,
};

export function useAdminPermissions(): PermissionFlags {
	const { data } = useQuery({
		queryKey: ["adminPermissions"],
		queryFn: () => checkPermissions(),
		staleTime: 5 * 60 * 1000,
	});
	return data ?? NO_PERMISSIONS;
}
