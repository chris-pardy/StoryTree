import "./NotificationBell.css";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Sprout } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseBudSplat } from "#/lib/bud-uri";
import {
	type NotificationView,
	notificationsQuery,
} from "#/queries/notifications";

const SEEN_AT_KEY = "branchline:notifications:seenAt";

function actorLabel(actor: NotificationView["actors"][number]): string {
	if (actor.displayName?.trim()) return actor.displayName;
	if (actor.handle) return `@${actor.handle}`;
	return actor.did;
}

function describeContinuation(notification: NotificationView): string {
	const { actors, actorCount } = notification;
	const first = actors[0];
	if (!first) return "someone grew your story";
	const firstLabel = actorLabel(first);
	if (actorCount === 1) return `${firstLabel} grew your story`;
	const second = actors[1];
	if (!second || actorCount === 2) {
		const secondLabel = second ? actorLabel(second) : "someone";
		return `${firstLabel} and ${secondLabel} grew your story`;
	}
	const others = actorCount - 2;
	return `${firstLabel}, ${actorLabel(second)}, and ${others} ${
		others === 1 ? "other" : "others"
	} grew your story`;
}

export default function NotificationBell() {
	const [mounted, setMounted] = useState(false);
	const [seenAt, setSeenAt] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [snapshot, setSnapshot] = useState<NotificationView[] | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setSeenAt(window.localStorage.getItem(SEEN_AT_KEY));
		setMounted(true);
	}, []);

	const { data: fetched } = useQuery({
		...notificationsQuery(seenAt),
		enabled: mounted,
	});

	useEffect(() => {
		if (!open) return;
		function onDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
				setSnapshot(null);
			}
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setOpen(false);
				setSnapshot(null);
			}
		}
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const notifications = snapshot ?? fetched ?? [];
	const hasUnread = (fetched?.length ?? 0) > 0;

	const toggleOpen = useCallback(() => {
		setOpen((prev) => {
			if (prev) {
				setSnapshot(null);
				return false;
			}
			// Freeze the currently-visible list while the popover is open so
			// bumping `seenAt` (which re-keys the query) doesn't blank it out.
			setSnapshot(fetched ?? []);
			const now = new Date().toISOString();
			window.localStorage.setItem(SEEN_AT_KEY, now);
			setSeenAt(now);
			return true;
		});
	}, [fetched]);

	const handleRowClick = useCallback(() => {
		setOpen(false);
		setSnapshot(null);
	}, []);

	return (
		<div className="notification-bell" ref={rootRef}>
			<button
				type="button"
				onClick={toggleOpen}
				aria-label={hasUnread ? "Notifications (new growth)" : "Notifications"}
				title="Notifications"
				aria-haspopup="menu"
				aria-expanded={open}
				className="notification-bell-button"
			>
				<Bell size={15} strokeWidth={1.6} aria-hidden="true" />
				{hasUnread && (
					<span className="notification-bell-dot" aria-hidden="true" />
				)}
			</button>
			{open && (
				<div className="notification-bell-popover" role="menu">
					{notifications.length === 0 ? (
						<p className="notification-bell-empty">No new growth yet.</p>
					) : (
						<ul className="notification-bell-list">
							{notifications.map((notification) => {
								const splat = parseBudSplat(notification.subjectUri);
								return (
									<li key={notification.subjectUri}>
										<Link
											to="/bud/$"
											params={{ _splat: splat }}
											className="notification-bell-row"
											onClick={handleRowClick}
											role="menuitem"
										>
											<Sprout
												size={15}
												strokeWidth={1.6}
												aria-hidden="true"
												className="notification-bell-icon"
											/>
											<span className="notification-bell-text">
												{describeContinuation(notification)}
											</span>
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
