import { Link } from "@tanstack/react-router";
import { Sparkles, Sprout } from "lucide-react";
import { useState } from "react";
import { createPollen } from "#/server/pollen/create";
import { AuthorLink } from "./AuthorLink";

export type Bloom = {
	uri: string;
	title: string;
	/** First slice of the bud's body text. Pre-truncated by the server. */
	textPreview: string;
	/** Bloom author DID. */
	author: string;
	/** Verified handle for display. Undefined when unresolved. */
	authorHandle?: string;
	/** Bluesky profile `displayName`, when the author has one. */
	authorDisplayName?: string;
	createdAt: string;
	intermediateCount: number;
	pollenCount: number;
	budCount: number;
	root: {
		uri: string;
		title: string;
		/** Root-bud author DID. */
		author: string;
		/** Verified handle for display. Undefined when unresolved. */
		authorHandle?: string;
		/** Bluesky profile `displayName`, when the author has one. */
		authorDisplayName?: string;
	};
};

function relative(ts: string) {
	const ms = Date.now() - new Date(ts).getTime();
	const hours = Math.round(ms / 3_600_000);
	if (hours < 1) return "just now";
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

function parseShorthand(uri: string) {
	const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
	if (!m) return null;
	return { authority: m[1], rkey: m[2] };
}

export function BloomCard({
	bloom,
	loggedIn,
}: {
	bloom: Bloom;
	loggedIn: boolean;
}) {
	const parsed = parseShorthand(bloom.uri);
	const splat = parsed ? `${parsed.authority}/${parsed.rkey}` : "";
	const authorLabel =
		bloom.authorDisplayName ?? bloom.authorHandle ?? bloom.author;

	// A bloom that _is_ the root has no "from" half, and the compound author
	// line collapses to a single name. Otherwise the latest contributor is the
	// bloom author and the first is the seed author.
	const isRootItself = bloom.uri === bloom.root.uri;
	const sameAuthor = bloom.author === bloom.root.author;
	const others = bloom.intermediateCount;

	const [pollinated, setPollinated] = useState(false);
	const [count, setCount] = useState(bloom.pollenCount);
	const [saving, setSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const pollinate = async () => {
		if (pollinated || saving) return;
		setSaving(true);
		setErrorMessage(null);
		setPollinated(true);
		setCount((c) => c + 1);
		try {
			await createPollen({ data: { subjectUri: bloom.uri } });
		} catch (e) {
			const reason = e instanceof Error ? e.message : String(e);
			// See StoryPiece: a prior-session pollen shows up as DuplicatePollen.
			// The optimistic UI already reflects the server state, so swallow it.
			if (reason === "DuplicatePollen") return;
			setPollinated(false);
			setCount((c) => c - 1);
			setErrorMessage(reason);
		} finally {
			setSaving(false);
		}
	};

	const buttonLabel = errorMessage
		? `Could not pollinate: ${errorMessage}`
		: `${pollinated ? "Pollinated" : "Pollinate"} ${authorLabel}'s bloom`;

	return (
		<article className="bloom-card rise-in">
			<header className="bloom-card-head">
				<span className="bloom-card-kicker">
					Bloom · {relative(bloom.createdAt)}
				</span>
			</header>

			<h2 className="bloom-card-title">
				<Link
					to="/bud/$"
					params={{ _splat: splat }}
					className="bloom-card-title-link"
				>
					{isRootItself ? (
						bloom.title
					) : (
						<>
							{bloom.root.title}
							<br />
							<em>and {bloom.title}</em>
						</>
					)}
				</Link>
			</h2>

			<p className="bloom-card-authors">
				by{" "}
				<AuthorLink
					did={bloom.author}
					handle={bloom.authorHandle}
					displayName={bloom.authorDisplayName}
					className="bloom-card-handle"
				/>
				{!isRootItself && !sameAuthor && (
					<>
						,{" "}
						<AuthorLink
							did={bloom.root.author}
							handle={bloom.root.authorHandle}
							displayName={bloom.root.authorDisplayName}
							className="bloom-card-handle"
						/>
					</>
				)}
				{others > 0 && (
					<>
						{" "}
						and {others} {others === 1 ? "other" : "others"}
					</>
				)}
			</p>

			{bloom.textPreview && (
				<p className="bloom-card-preview">{bloom.textPreview}</p>
			)}

			<footer className="bloom-card-stats">
				<span className="bloom-card-stat">
					<Sprout size={13} strokeWidth={1.6} aria-hidden="true" />
					<span>
						{bloom.budCount} {bloom.budCount === 1 ? "bud" : "buds"}
					</span>
				</span>
				{loggedIn ? (
					<button
						type="button"
						className="bloom-card-stat bloom-card-stat-action"
						aria-label={buttonLabel}
						title={buttonLabel}
						aria-pressed={pollinated}
						disabled={saving || pollinated}
						data-errored={errorMessage ? true : undefined}
						onClick={() => void pollinate()}
					>
						<Sparkles size={13} strokeWidth={1.6} aria-hidden="true" />
						<span>{count}</span>
					</button>
				) : (
					<Link
						to="/login"
						className="bloom-card-stat bloom-card-stat-action"
						aria-label="Sign in to pollinate this bloom"
					>
						<Sparkles size={13} strokeWidth={1.6} aria-hidden="true" />
						<span>{bloom.pollenCount}</span>
					</Link>
				)}
			</footer>
		</article>
	);
}
