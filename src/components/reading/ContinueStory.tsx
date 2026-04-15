import { Link, useRouterState } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
	IfLoggedIn,
	IfLoggedOut,
	IfNotViewer,
	useViewerDid,
} from "#/components/auth/gates";
import { publishBud } from "#/server/buds/publish";
import type { FormatSpan } from "#/server/indexer/validate";
import { proseMirrorToBud } from "./pm-to-bud";
import { renderBudBody } from "./render-bud";
import type { DraftStory, Story } from "./types";

type Draft = {
	title: string;
	text: string;
	formatting?: Array<FormatSpan>;
};

/**
 * Presentational editor. Owns its own title + tiptap state, but delegates
 * the saving/error lifecycle to the parent — the parent is the one that
 * knows how to actually persist (publishBud, local-only, etc.) and how to
 * react to a successful publish (append to local stories, push URL, open
 * share prompt).
 */
function ContinueEditor({
	onSubmit,
	onCancel,
	saving,
	error,
}: {
	onSubmit: (draft: Draft) => void;
	onCancel: () => void;
	saving: boolean;
	error: string | null;
}) {
	const [title, setTitle] = useState("");

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				bulletList: false,
				orderedList: false,
				listItem: false,
				code: false,
				codeBlock: false,
				horizontalRule: false,
				strike: false,
			}),
			Placeholder.configure({
				placeholder: "And so it continues…",
			}),
		],
		content: "",
		immediatelyRender: false,
	});

	const submit = () => {
		if (!editor || saving) return;
		if (editor.isEmpty && !title.trim()) return;
		const { text, formatting } = proseMirrorToBud(editor.getJSON());
		onSubmit({ title: title.trim(), text, formatting });
	};

	const handleContainerKey = (e: React.KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			submit();
		} else if (e.key === "Escape" && !saving) {
			e.preventDefault();
			onCancel();
		}
	};

	return (
		<form
			className="continue-editor"
			onKeyDown={handleContainerKey}
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<input
				type="text"
				className="continue-title-input"
				placeholder="A title for this passage…"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				disabled={saving}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						editor?.commands.focus("end");
					}
				}}
			/>
			<EditorContent editor={editor} />
			<div className="continue-submit-row">
				<span className="continue-hint" aria-hidden="true">
					{error
						? error
						: saving
							? "publishing to your repo…"
							: "⌘↵ to publish · esc to close"}
				</span>
				<button
					type="button"
					className="continue-submit"
					onClick={submit}
					disabled={saving}
				>
					{saving ? (
						<>
							<Loader2
								size={14}
								strokeWidth={1.8}
								className="continue-submit-spinner"
								aria-hidden="true"
							/>
							publishing…
						</>
					) : (
						"publish ↵"
					)}
				</button>
			</div>
		</form>
	);
}

export function ContinueStory({
	onAdd,
	onPublished,
	parentUri,
	parentAuthor,
}: {
	/** Local-only fallback for routes that don't have a persisted parent. */
	onAdd?: (draft: DraftStory) => void;
	/** Called after a successful publishBud — parent appends, scrolls, opens share. */
	onPublished?: (story: Story) => void;
	parentUri?: string;
	parentAuthor?: string;
}) {
	const [writing, setWriting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const viewerDid = useViewerDid();
	// Used to round-trip the logged-out viewer back here after they sign in.
	// Pull both pathname and hash so a deep-link visitor (e.g. from a
	// bluesky crosspost landing on `#bud-<rkey>`) returns to the same anchor.
	const returnTo = useRouterState({
		select: (s) =>
			s.location.pathname + (s.location.hash ? `#${s.location.hash}` : ""),
	});

	const handleSubmit = async (draft: Draft) => {
		if (saving) return;
		if (!parentUri) {
			// Local-only path — no persisted parent, no server fn. Kept for
			// any caller that mounts ReadingColumn without a real bud context.
			onAdd?.({
				title: draft.title,
				body: renderBudBody(draft.text, draft.formatting),
			});
			setWriting(false);
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const { uri } = await publishBud({
				data: {
					parentUri,
					title: draft.title,
					text: draft.text,
					formatting: draft.formatting,
				},
			});
			// Build the optimistic Story locally so the parent can append it
			// without round-tripping through the route loader. Mirrors the shape
			// produced by `rowToStory` in bud-loader.ts.
			const newStory: Story = {
				id: uri,
				title: draft.title || undefined,
				author: viewerDid ?? "",
				timestamp: new Date().toISOString(),
				pollen: 0,
				body: renderBudBody(draft.text, draft.formatting),
				fresh: true,
			};
			onPublished?.(newStory);
			setWriting(false);
			setSaving(false);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Could not publish this passage.",
			);
			setSaving(false);
		}
	};

	if (!writing) {
		return (
			<IfNotViewer did={parentAuthor}>
				<div className="continue-prompt-wrap">
					<IfLoggedIn>
						<button
							type="button"
							className="continue-prompt"
							onClick={() => setWriting(true)}
						>
							↳ continue this story
						</button>
					</IfLoggedIn>
					<IfLoggedOut>
						<Link to="/login" search={{ returnTo }} className="continue-prompt">
							↳ login to continue this story
						</Link>
					</IfLoggedOut>
				</div>
			</IfNotViewer>
		);
	}

	return (
		<ContinueEditor
			onSubmit={handleSubmit}
			onCancel={() => setWriting(false)}
			saving={saving}
			error={error}
		/>
	);
}
