import "./BranchLink.css";
import { Link } from "@tanstack/react-router";
import { Sprout } from "lucide-react";
import { parseBudSplat } from "#/lib/bud-uri";

export function BranchLink({
	bud,
}: {
	bud: { uri: string; children?: string[] };
}) {
	const childCount = bud.children?.length ?? 0;

	return (
		<Link
			to="/bud/$"
			params={{ _splat: parseBudSplat(bud.uri) }}
			className="branch-indicator"
			aria-label={`${childCount} ${childCount === 1 ? "branch" : "branches"}`}
			title={`${childCount} ${childCount === 1 ? "branch" : "branches"}`}
			reloadDocument={false}
			resetScroll={false}
			hashScrollIntoView={false}
			viewTransition={false}
			ignoreBlocker={true}
		>
			<Sprout size={13} strokeWidth={1.8} aria-hidden="true" />
			<span className="branch-count">{childCount}</span>
		</Link>
	);
}
