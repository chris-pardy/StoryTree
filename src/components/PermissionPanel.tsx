import "./PermissionPanel.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "#/queries/keys";
import {
	getProfilePermissions,
	type PermissionFlags,
	setPermission,
} from "#/server/admin";

const FLAGS: ReadonlyArray<{
	key: keyof PermissionFlags;
	label: string;
}> = [
	{ key: "canGrantSeeds", label: "Grant Seeds" },
	{ key: "canDeleteBuds", label: "Delete Buds" },
	{ key: "canLockBuds", label: "Lock Buds" },
	{ key: "canGrantPermissions", label: "Grant Permissions" },
];

export function PermissionPanel({ did }: { did: string }) {
	const queryClient = useQueryClient();
	const { data: perms } = useQuery({
		queryKey: queryKeys.profilePermissions(did),
		queryFn: () => getProfilePermissions({ data: { did } }),
		staleTime: 60_000,
	});
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (!perms) return null;

	async function toggle(flag: keyof PermissionFlags) {
		if (busy || !perms) return;
		setBusy(flag);
		setError(null);
		try {
			await setPermission({
				data: { did, flag, value: !perms[flag] },
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.profilePermissions(did),
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not update permission");
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="permission-panel">
			<p className="permission-panel-kicker">Permissions</p>
			<div className="permission-panel-flags">
				{FLAGS.map(({ key, label }) => (
					<button
						key={key}
						type="button"
						className={`permission-pill${perms[key] ? " is-active" : ""}`}
						disabled={busy !== null}
						aria-pressed={perms[key]}
						onClick={() => void toggle(key)}
					>
						{busy === key ? "\u2026" : label}
					</button>
				))}
			</div>
			{error && (
				<p className="permission-panel-error" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
