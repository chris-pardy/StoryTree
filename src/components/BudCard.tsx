import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { createPollen } from "#/server/pollen/create";
import { AuthorLink } from "./AuthorLink";
import { IfLoggedIn, IfLoggedOut, IfNotViewer } from "./auth/gates";

export type Bud = {
	uri: string;
	title: string;
	/** Author DID — also used as the identity key for `IfNotViewer`. */
	author: string;
	/** Verified handle for display. Undefined when unresolved (fall back to DID). */
	authorHandle?: string;
	/** Bluesky profile `displayName`, when the author has one. */
	authorDisplayName?: string;
	createdAt: string;
	pollenCount: number;
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

export function BudCard({ bud }: { bud: Bud }) {
	const parsed = parseShorthand(bud.uri);
	const splat = parsed ? `${parsed.authority}/${parsed.rkey}` : "";
	const authorLabel = bud.authorDisplayName ?? bud.authorHandle ?? bud.author;

	const [pollinated, setPollinated] = useState(false);
	const [count, setCount] = useState(bud.pollenCount);
	const [saving, setSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const pollinate = async () => {
		if (pollinated || saving) return;
		setSaving(true);
		setErrorMessage(null);
		setPollinated(true);
		setCount((c) => c + 1);
		try {
			await createPollen({ data: { subjectUri: bud.uri } });
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
		: `${pollinated ? "Pollinated" : "Pollinate"} ${authorLabel}'s bud`;

	return (
		<article className="bud-card rise-in">
			<header className="bud-card-head">
				<span className="bud-card-kicker">Bud · {relative(bud.createdAt)}</span>
				<IfLoggedIn>
					<IfNotViewer did={bud.author}>
						<button
							type="button"
							className="bud-card-pollen"
							aria-label={buttonLabel}
							title={buttonLabel}
							aria-pressed={pollinated}
							disabled={saving || pollinated}
							data-errored={errorMessage ? true : undefined}
							onClick={() => void pollinate()}
						>
							<Sparkles size={12} strokeWidth={1.6} aria-hidden="true" />
							<span>{count}</span>
						</button>
					</IfNotViewer>
				</IfLoggedIn>
				<IfLoggedOut>
					<Link
						to="/login"
						className="bud-card-pollen"
						aria-label="Sign in to pollinate this bud"
					>
						<Sparkles size={12} strokeWidth={1.6} aria-hidden="true" />
						<span>{bud.pollenCount}</span>
					</Link>
				</IfLoggedOut>
			</header>

			<h3 className="bud-card-title">
				<Link
					to="/bud/$"
					params={{ _splat: splat }}
					className="bud-card-title-link"
				>
					{bud.title}
				</Link>
			</h3>
			<p className="bud-card-author">
				by{" "}
				<AuthorLink
					did={bud.author}
					handle={bud.authorHandle}
					displayName={bud.authorDisplayName}
					className="bud-card-handle"
				/>
			</p>
		</article>
	);
}
