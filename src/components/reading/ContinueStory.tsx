import "./ContinueStory.css";
import { Link, useRouterState } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { IfLoggedIn, IfLoggedOut, IfNotViewer } from "#/components/auth/gates";
import { publishBud } from "#/server/buds/publish";
import type { FormatSpan } from "#/server/indexer/validate";
import { proseMirrorToBud } from "./pm-to-bud";

export type Draft = {
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
export function ContinueEditor({
	onSubmit,
	onCancel,
	saving,
	error,
	placeholder = "Start writing…",
}: {
	onSubmit: (draft: Draft) => void;
	onCancel: () => void;
	saving: boolean;
	error: string | null;
	placeholder?: string;
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
				placeholder,
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
	onPublished,
	parentUri,
	parentAuthor,
}: {
	onPublished: (uri: string) => void;
	parentUri: string;
	parentAuthor: string;
}) {
	const [writing, setWriting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Round-trip the logged-out viewer back here (including hash anchors for
	// deep-linked crossposts) after they sign in.
	const returnTo = useRouterState({
		select: (s) =>
			s.location.pathname + (s.location.hash ? `#${s.location.hash}` : ""),
	});

	const handleSubmit = async (draft: Draft) => {
		if (saving) return;
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
			setSaving(false);
			setWriting(false);
			onPublished(uri);
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
			placeholder="And so it continues…"
		/>
	);
}
