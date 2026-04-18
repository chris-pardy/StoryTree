import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useViewerDid } from "#/components/auth/gates";

async function createPollen(subjectUri: string) {
	const res = await fetch("/xrpc/ink.branchline.createPollen", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ subjectUri }),
	});
	if (!res.ok) {
		const data = await res.json().catch(() => null);
		throw new Error(data?.error ?? `pollinate failed: ${res.status}`);
	}
	return res.json();
}

async function deletePollen(subjectUri: string) {
	const res = await fetch("/xrpc/ink.branchline.deletePollen", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ subjectUri }),
	});
	if (!res.ok) {
		const data = await res.json().catch(() => null);
		throw new Error(data?.error ?? `unpollinate failed: ${res.status}`);
	}
	return res.json();
}

export function usePollination(
	subjectUri: string,
	authorDid: string | null | undefined,
	initialCount: number,
	initialPollinated?: boolean,
) {
	const viewerDid = useViewerDid();
	const isOwnBud = viewerDid != null && viewerDid === authorDid;
	const canPollinate = viewerDid != null && !isOwnBud;

	const [pollinated, setPollinated] = useState(initialPollinated ?? false);
	const [count, setCount] = useState(initialCount);

	const addMutation = useMutation({
		mutationFn: () => createPollen(subjectUri),
		onMutate: () => {
			setPollinated(true);
			setCount((c) => c + 1);
		},
		onError: (err) => {
			if (err.message === "DuplicatePollen") return;
			setPollinated(false);
			setCount((c) => c - 1);
		},
	});

	const removeMutation = useMutation({
		mutationFn: () => deletePollen(subjectUri),
		onMutate: () => {
			setPollinated(false);
			setCount((c) => c - 1);
		},
		onError: () => {
			setPollinated(true);
			setCount((c) => c + 1);
		},
	});

	const saving = addMutation.isPending || removeMutation.isPending;
	const error = addMutation.error ?? removeMutation.error;

	return {
		canPollinate,
		pollinated,
		count,
		saving,
		errorMessage: error?.message ?? null,
		toggle: () => {
			if (!canPollinate || saving) return;
			if (pollinated) {
				removeMutation.mutate();
			} else {
				addMutation.mutate();
			}
		},
	};
}
