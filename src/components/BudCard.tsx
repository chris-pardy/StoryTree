import "./BloomCard.css";
import "./BudCard.css";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { parseBudSplat } from "#/lib/bud-uri";
import { budQuery } from "#/queries/buds";
import { AuthorLink } from "./AuthorLink";
import { BranchLink } from "./BranchLink";
import { PollenButton } from "./PollenButton";
import { TreeLink } from "./TreeLink";

function relative(ts: string) {
	const ms = Date.now() - new Date(ts).getTime();
	const hours = Math.round(ms / 3_600_000);
	if (hours < 1) return "just now";
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

export function BudCard({
	uri,
	rootUri,
	treeHeight,
}: {
	uri: string;
	rootUri?: string;
	treeHeight?: number;
}) {
	const { data: bud } = useQuery(budQuery(uri));
	const { data: root } = useQuery(budQuery(rootUri ?? uri));

	if (!bud) return null;

	const splat = parseBudSplat(uri);
	const showRoot = root && rootUri && rootUri !== uri;
	const sameAuthor =
		showRoot &&
		!!root.author &&
		!!bud.author &&
		root.author.did === bud.author.did;

	return (
		<article className="bloom-card rise-in">
			<header className="bloom-card-head">
				<span className="bloom-card-kicker">{relative(bud.createdAt)}</span>
			</header>

			<h2 className="bloom-card-title">
				<Link
					to="/bud/$"
					params={{ _splat: splat }}
					className="bloom-card-title-link"
				>
					{showRoot ? (
						<>
							{root.title}
							<br />
							<em>and {bud.title}</em>
						</>
					) : (
						bud.title
					)}
				</Link>
			</h2>

			<p className="bloom-card-authors">
				by{" "}
				<AuthorLink
					did={bud.author?.did}
					handle={bud.author?.handle}
					displayName={bud.author?.displayName}
					className="bloom-card-handle"
				/>
				{showRoot && !sameAuthor && (
					<>
						,{" "}
						<AuthorLink
							did={root.author?.did}
							handle={root.author?.handle}
							displayName={root.author?.displayName}
							className="bloom-card-handle"
						/>
					</>
				)}
			</p>

			{bud.text && (
				<p className="bloom-card-preview">{bud.text.slice(0, 240)}</p>
			)}

			<footer className="bloom-card-stats">
				{treeHeight !== undefined ? (
					<TreeLink uri={bud.uri} height={treeHeight} />
				) : (
					<BranchLink bud={bud} />
				)}
				<PollenButton bud={bud} />
			</footer>
		</article>
	);
}
