import { type ReactNode, useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { AuthorLink } from "#/components/AuthorLink";
import { useViewerDid } from "#/components/auth/gates";
import { BskyCrosspostPrompt } from "./BskyCrosspostPrompt";
import { anchorForBudUri } from "./bud-loader";
import { ContinueStory } from "./ContinueStory";
import { StoryPiece } from "./StoryPiece";
import type { DraftStory, Story } from "./types";

export function ReadingColumn({
	initialStories,
	trailing,
}: {
	initialStories: Array<Story>;
	trailing?: ReactNode;
}) {
	const [stories, setStories] = useState<Array<Story>>(initialStories);
	const viewerDid = useViewerDid();

	// Optimistic publish: append the new story locally, push the canonical
	// leaf URL into the history stack (no route reload — that would re-run
	// the loader and re-stream Suspense, which loses our local state), and
	// scroll the new piece into view.
	//
	// Once the new story is `lastStory`, the trailing slot's static
	// condition (`lastStory.author === viewerDid`) flips and the bluesky
	// crosspost prompt appears below it automatically — no extra signal
	// needed.
	const handlePublished = useCallback((newStory: Story) => {
		flushSync(() => {
			setStories((prev) => [...prev, newStory]);
		});
		const splat = newStory.id.replace(/^at:\/\//, "");
		const anchor = anchorForBudUri(newStory.id);
		const newUrl = `/at/${splat}${anchor ? `#${anchor}` : ""}`;
		window.history.pushState({}, "", newUrl);
		if (anchor) {
			requestAnimationFrame(() => {
				document
					.getElementById(anchor)
					?.scrollIntoView({ behavior: "smooth", block: "start" });
			});
		}
	}, []);

	const addStory = useCallback((draft: DraftStory) => {
		setStories((prev) => [
			...prev,
			{
				id:
					typeof crypto !== "undefined" && "randomUUID" in crypto
						? crypto.randomUUID()
						: String(Date.now()),
				title: draft.title.trim() || undefined,
				author: "@you",
				timestamp: new Date().toISOString(),
				pollen: 0,
				body: draft.body,
				fresh: true,
			},
		]);
	}, []);

	const firstStory = stories[0];
	const lastStory = stories[stories.length - 1];
	const firstTitle = firstStory?.title;
	const lastTitle = lastStory?.title;
	const showPair = Boolean(firstTitle && lastTitle) && firstTitle !== lastTitle;

	const uniqueAuthorCount = new Set(stories.map((s) => s.author)).size;
	const othersCount = Math.max(0, uniqueAuthorCount - 2);

	// Static condition: if the viewer authored the leaf, the trailing slot
	// shows the bluesky crosspost prompt (instead of the continue button,
	// which is hidden because you can't continue your own story).
	const viewerOwnsLeaf =
		!!viewerDid && !!lastStory && lastStory.author === viewerDid;

	// Identity (`story.author`) is always the DID so the viewer-own check
	// stays correct; AuthorLink prefers the resolved handle for display.
	const firstLink = firstStory ? (
		<AuthorLink
			did={firstStory.author}
			handle={firstStory.authorHandle}
			displayName={firstStory.authorDisplayName}
			className="masthead-handle"
		/>
	) : null;
	const lastLink = lastStory ? (
		<AuthorLink
			did={lastStory.author}
			handle={lastStory.authorHandle}
			displayName={lastStory.authorDisplayName}
			className="masthead-handle"
		/>
	) : null;
	const sameAuthor =
		firstStory != null &&
		lastStory != null &&
		firstStory.author === lastStory.author;

	let contributors: ReactNode = null;
	if (firstLink && lastLink) {
		if (sameAuthor) {
			contributors = <>By {firstLink}</>;
		} else if (othersCount === 0) {
			contributors = (
				<>
					By {lastLink}
					{", "}
					{firstLink}
				</>
			);
		} else {
			contributors = (
				<>
					By {lastLink}
					{", "}
					{firstLink}
					{`, and ${othersCount} ${othersCount === 1 ? "other" : "others"}`}
				</>
			);
		}
	}

	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">
					{stories.length} {stories.length === 1 ? "reading" : "readings"}
				</p>
				<h1 className="masthead-title">
					{showPair ? (
						<>
							{firstTitle}
							<br />
							<em>and {lastTitle}</em>
						</>
					) : (
						(firstTitle ?? "Stories")
					)}
				</h1>
				{contributors && <p className="masthead-byline">{contributors}</p>}
			</header>

			<ol className="reading-list">
				{stories.map((story, i) => (
					<li key={story.id}>
						<StoryPiece story={story} index={i} />
					</li>
				))}
			</ol>

			{viewerOwnsLeaf && lastStory ? (
				<BskyCrosspostPrompt
					key={lastStory.id}
					budUri={lastStory.id}
					budTitle={lastStory.title}
				/>
			) : (
				<ContinueStory
					onAdd={addStory}
					onPublished={handlePublished}
					parentUri={lastStory?.id}
					parentAuthor={lastStory?.author}
				/>
			)}

			{trailing}
		</main>
	);
}
