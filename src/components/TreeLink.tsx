import "./BranchLink.css";
import { Link } from "@tanstack/react-router";
import { Trees } from "lucide-react";
import { parseBudSplat } from "#/lib/bud-uri";

export function TreeLink({ uri, height }: { uri: string; height: number }) {
	const label = `tree height ${height}`;
	return (
		<Link
			to="/bud/$"
			params={{ _splat: parseBudSplat(uri) }}
			className="branch-indicator"
			aria-label={label}
			title={label}
			reloadDocument={false}
			resetScroll={false}
			hashScrollIntoView={false}
			viewTransition={false}
			ignoreBlocker={true}
		>
			<Trees size={13} strokeWidth={1.8} aria-hidden="true" />
			<span className="branch-count">{height}</span>
		</Link>
	);
}
