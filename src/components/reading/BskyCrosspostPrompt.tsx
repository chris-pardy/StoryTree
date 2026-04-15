import { Loader2 } from "lucide-react";
import { useState } from "react";
import { crosspostBudToBsky } from "#/server/buds/crosspost";

type Status = "composing" | "posting" | "posted";

/**
 * Always-visible bluesky crosspost composer. Rendered by `ReadingColumn`
 * at the trailing slot when the viewer is the author of the leaf. Sits in
 * the same position the "continue this story" affordance would occupy if
 * the viewer were continuing someone else's story — the two are mutually
 * exclusive (you can't continue your own story).
 *
 * Parent is responsible for keying this component on `budUri` so the
 * compose state resets when the underlying bud changes (e.g. after a
 * fresh publish appends a new piece).
 */
export function BskyCrosspostPrompt({
	budUri,
	budTitle,
}: {
	budUri: string;
	budTitle?: string;
}) {
	const [status, setStatus] = useState<Status>("composing");
	const [message, setMessage] = useState(budTitle?.trim() ?? "");
	const [error, setError] = useState<string | null>(null);

	if (status === "posted") {
		return (
			<div className="bsky-prompt" data-state="posted">
				<span className="bsky-prompt-note">posted to bluesky ✓</span>
			</div>
		);
	}

	const submit = async () => {
		if (status === "posting") return;
		setStatus("posting");
		setError(null);
		try {
			await crosspostBudToBsky({
				data: {
					budUri,
					message: message.trim() || budTitle?.trim() || "",
				},
			});
			setStatus("posted");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not post to Bluesky.");
			setStatus("composing");
		}
	};

	const posting = status === "posting";

	return (
		<div className="bsky-prompt" data-state="composing">
			<label className="bsky-prompt-label" htmlFor="bsky-prompt-message">
				share on bluesky
			</label>
			<textarea
				id="bsky-prompt-message"
				className="bsky-prompt-textarea"
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				placeholder="What to say…"
				rows={2}
				maxLength={260}
				disabled={posting}
			/>
			<div className="bsky-prompt-row">
				<span className="bsky-prompt-hint">
					{error
						? error
						: posting
							? "posting…"
							: "A link to this passage will be appended."}
				</span>
				<button
					type="button"
					className="bsky-prompt-link"
					onClick={() => void submit()}
					disabled={posting}
				>
					{posting ? (
						<>
							<Loader2
								size={14}
								strokeWidth={1.8}
								className="continue-submit-spinner"
								aria-hidden="true"
							/>
							posting…
						</>
					) : (
						"post ↵"
					)}
				</button>
			</div>
		</div>
	);
}
