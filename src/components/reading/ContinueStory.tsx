import "./ContinueStory.css";
import { Link, useRouterState } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { IfLoggedIn, IfLoggedOut, IfNotViewer } from "#/components/auth/gates";
import { publishBud } from "#/server/buds/publish";
import type { FormatSpan } from "#/server/indexer/validate";
import { BUD_WORD_LIMIT, countWords } from "#/server/indexer/wordCount";
import { budToProseMirror, proseMirrorToBud } from "./pm-to-bud";

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
	initial,
	action = "publish",
}: {
	onSubmit: (draft: Draft) => void;
	onCancel: () => void;
	saving: boolean;
	error: string | null;
	placeholder?: string;
	initial?: Draft;
	action?: "publish" | "save";
}) {
	const [title, setTitle] = useState(initial?.title ?? "");
	const [wordCount, setWordCount] = useState(() =>
		initial?.text ? countWords(initial.text) : 0,
	);

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
		content: initial ? budToProseMirror(initial.text, initial.formatting) : "",
		immediatelyRender: false,
		onUpdate: ({ editor }) => {
			const { text } = proseMirrorToBud(editor.getJSON());
			setWordCount(countWords(text));
		},
	});

	const verb = action === "save" ? "save" : "publish";
	const gerund = action === "save" ? "saving" : "publishing";

	const overLimit = wordCount > BUD_WORD_LIMIT;

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
			{action === "save" && (
				<p className="edit-pollen-note">
					Saving resets this bud's pollen so readers can weigh the new version.
				</p>
			)}
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
							? `${gerund} to your repo…`
							: `⌘↵ to ${verb} · esc to close`}
				</span>
				<div className="continue-submit-actions">
					<span
						className={`continue-wordcount${overLimit ? " is-over" : ""}`}
						aria-label={`${wordCount} of ${BUD_WORD_LIMIT} words`}
					>
						{wordCount}/{BUD_WORD_LIMIT}
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
								{gerund}…
							</>
						) : (
							`${verb} ↵`
						)}
					</button>
				</div>
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
	parentAuthor: string | null | undefined;
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

function formatBloomsIn(ms: number): string {
	if (ms <= 0) return "blooming any moment";
	const minutes = Math.ceil(ms / 60_000);
	if (minutes < 2) return "blooms in about a minute";
	if (minutes < 45) return `blooms in ${minutes} minutes`;
	if (minutes < 90) return "blooms in about an hour";
	const hours = Math.round(minutes / 60);
	return `blooms in ${hours} hours`;
}

/**
 * Occupies the slot where "↳ continue this story" would otherwise sit for
 * a leaf bud, when that leaf is still in its growing window. Reads
 * `bloomsAt` off the BudView so the countdown stays accurate even if the
 * server-side growing window is ever retuned.
 */
export function BloomingNotice({ bloomsAt }: { bloomsAt: string }) {
	const bloomsAtMs = new Date(bloomsAt).getTime();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(id);
	}, []);
	const remaining = bloomsAtMs - now;
	return (
		<div className="blooming-notice-wrap">
			<span className="blooming-notice">
				<span className="blooming-notice-dot" aria-hidden="true" />
				growing · {formatBloomsIn(remaining)}
			</span>
		</div>
	);
}
