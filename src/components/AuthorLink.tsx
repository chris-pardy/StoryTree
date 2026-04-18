import { Link } from "@tanstack/react-router";

/**
 * Renders an author identifier as a link to their `/$handle` profile page.
 * Mirrors Bluesky's display convention — when we have a profile display
 * name it shows as the primary label with a muted `@handle` suffix. When
 * there's no display name the handle carries the link alone (no leading
 * `@` is applied only when the handle is verified — an unresolved author
 * falls all the way back to the raw DID, which is rendered untouched so
 * the user still sees _something_ meaningful).
 */
export function AuthorLink({
	did,
	handle,
	displayName,
	className,
}: {
	did?: string | null;
	handle?: string;
	displayName?: string;
	className?: string;
}) {
	// A null/undefined DID means the bud has been soft-deleted by its
	// author. Render an inert "Anonymous" label rather than a profile link.
	if (!did) {
		return <span className={className}>Anonymous</span>;
	}
	// Profile route accepts either a handle or a raw DID; prefer the handle
	// so the URL is stable + human-readable.
	const param = handle ?? did;
	return (
		<Link to="/$handle" params={{ handle: param }} className={className}>
			{displayName ? (
				<>
					{displayName}
					{handle && (
						<>
							{" "}
							<span className="text-muted-foreground font-normal">
								@{handle}
							</span>
						</>
					)}
				</>
			) : handle ? (
				<>@{handle}</>
			) : (
				did
			)}
		</Link>
	);
}
