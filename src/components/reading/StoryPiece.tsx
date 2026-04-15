import { Sparkles } from "lucide-react";
import { useState } from "react";
import { AuthorLink } from "#/components/AuthorLink";
import { IfLoggedIn, IfNotViewer } from "#/components/auth/gates";
import { createPollen } from "#/server/pollen/create";
import { anchorForBudUri } from "./bud-loader";
import type { Story } from "./types";

const dateFmt = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
});

export function StoryPiece({ story, index }: { story: Story; index: number }) {
	const [pollinated, setPollinated] = useState(false);
	const [count, setCount] = useState(story.pollen);
	const [saving, setSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const toggle = async () => {
		// No un-pollinate path yet — the button is a one-shot per session.
		// If you've already pollinated this bud (or are mid-request), ignore.
		if (pollinated || saving) return;

		// Optimistic: flip the UI immediately. Revert on non-duplicate error.
		setSaving(true);
		setErrorMessage(null);
		setPollinated(true);
		setCount((c) => c + 1);

		try {
			await createPollen({ data: { subjectUri: story.id } });
		} catch (e) {
			const reason = e instanceof Error ? e.message : String(e);
			// `DuplicatePollen` means the server already has our pollen on this
			// bud from a previous session — the optimistic UI is correct, so we
			// swallow the error and leave the button locked in.
			if (reason === "DuplicatePollen") return;

			setPollinated(false);
			setCount((c) => c - 1);
			setErrorMessage(reason);
		} finally {
			setSaving(false);
		}
	};

	const animationDelay = story.fresh ? "40ms" : `${180 + index * 130}ms`;

	const authorLabel =
		story.authorDisplayName ?? story.authorHandle ?? story.author;
	const buttonLabel = errorMessage
		? `Could not pollinate: ${errorMessage}`
		: `${pollinated ? "Pollinated" : "Pollinate"} ${authorLabel}'s bud`;

	const anchorId = anchorForBudUri(story.id) ?? undefined;

	return (
		<article id={anchorId} className="story rise-in" style={{ animationDelay }}>
			<div
				className="story-prose"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: story.body is sanitized HTML produced by render-bud
				dangerouslySetInnerHTML={{ __html: story.body }}
			/>
			<footer className="byline" data-pollinated={pollinated || undefined}>
				<div className="byline-attribution">
					<span className="byline-dash" aria-hidden="true">
						—
					</span>
					<AuthorLink
						did={story.author}
						handle={story.authorHandle}
						displayName={story.authorDisplayName}
						className="byline-handle"
					/>
					<span className="byline-sep" aria-hidden="true">
						·
					</span>
					<time dateTime={story.timestamp}>
						{dateFmt.format(new Date(story.timestamp))}
					</time>
				</div>
				<IfLoggedIn>
					<IfNotViewer did={story.author}>
						<button
							type="button"
							onClick={() => void toggle()}
							aria-pressed={pollinated}
							aria-label={buttonLabel}
							title={buttonLabel}
							disabled={saving || pollinated}
							data-errored={errorMessage ? true : undefined}
							className={pollinated ? "pollen is-pollinated" : "pollen"}
						>
							<Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
							<span className="pollen-count">{count}</span>
						</button>
					</IfNotViewer>
				</IfLoggedIn>
			</footer>
		</article>
	);
}
