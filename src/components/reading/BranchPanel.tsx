import "./BranchPanel.css";
import { Link } from "@tanstack/react-router";
import { Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthorLink } from "#/components/AuthorLink";
import { type BranchChild, fetchBudChildren } from "./bud-loader";

function parseShorthand(uri: string) {
	const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
	if (!m) return null;
	return { authority: m[1], rkey: m[2] };
}

function BranchCard({
	child,
	isCurrentPath,
}: {
	child: BranchChild;
	isCurrentPath: boolean;
}) {
	const parsed = parseShorthand(child.uri);
	const splat = parsed ? `${parsed.authority}/${parsed.rkey}` : "";

	return (
		<article
			className={`branch-card${isCurrentPath ? " is-current-path" : ""}`}
		>
			<header className="branch-card-head">
				<span className="branch-card-kicker">
					{child.childCount > 0 && (
						<>
							<Sprout size={11} strokeWidth={1.8} aria-hidden="true" />
							<span>{child.childCount}</span>
						</>
					)}
				</span>
			</header>
			<h3 className="branch-card-title">
				<Link
					to="/bud/$"
					params={{ _splat: splat }}
					className="branch-card-title-link"
				>
					{child.title}
				</Link>
			</h3>
			{child.textPreview && (
				<p className="branch-card-preview">{child.textPreview}</p>
			)}
			<p className="branch-card-author">
				by{" "}
				<AuthorLink
					did={child.author}
					handle={child.authorHandle}
					displayName={child.authorDisplayName}
					className="branch-card-handle"
				/>
			</p>
		</article>
	);
}

export function BranchPanel({
	parentUri,
	currentPathUris,
}: {
	parentUri: string;
	currentPathUris: Set<string>;
}) {
	const [children, setChildren] = useState<Array<BranchChild> | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		fetchBudChildren({ data: { parentUri } }).then((result) => {
			if (!cancelled) {
				setChildren(result);
				setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [parentUri]);

	return (
		<section className="branch-panel rise-in" aria-label="Story branches">
			<header className="branch-panel-head">
				<div>
					<p className="masthead-kicker">Branches</p>
					<h2 className="branch-panel-title">
						{loading
							? "Loading branches..."
							: `${children?.length ?? 0} ${(children?.length ?? 0) === 1 ? "branch" : "branches"} from here`}
					</h2>
				</div>
			</header>
			{loading ? (
				<div className="branch-panel-loading">
					<p>Discovering branches...</p>
				</div>
			) : children && children.length > 0 ? (
				<ul className="branch-grid">
					{children.map((child) => (
						<li key={child.uri}>
							<BranchCard
								child={child}
								isCurrentPath={currentPathUris.has(child.uri)}
							/>
						</li>
					))}
				</ul>
			) : (
				<p className="branch-panel-empty">No branches from this bud yet.</p>
			)}
		</section>
	);
}
