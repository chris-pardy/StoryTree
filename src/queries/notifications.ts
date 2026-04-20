import { queryOptions } from "@tanstack/react-query";
import type * as ListNotifications from "#/generated/lexicons/types/ink/branchline/listNotifications";
import { queryKeys } from "./keys";

export type NotificationView = ListNotifications.NotificationView;

async function fetchNotifications(
	seenAt: string | null,
): Promise<NotificationView[]> {
	const params = new URLSearchParams();
	if (seenAt) params.set("seenAt", seenAt);
	const res = await fetch(
		`/xrpc/ink.branchline.listNotifications?${params.toString()}`,
	);
	if (res.status === 401) return [];
	if (!res.ok) throw new Error(`listNotifications failed: ${res.status}`);
	const data: ListNotifications.OutputSchema = await res.json();
	return data.notifications;
}

export function notificationsQuery(seenAt: string | null) {
	return queryOptions<NotificationView[]>({
		queryKey: queryKeys.notifications(seenAt),
		queryFn: () => fetchNotifications(seenAt),
		staleTime: 60_000,
		refetchOnWindowFocus: true,
	});
}
