import "./PollenButton.css";
import { Sparkles } from "lucide-react";
import { usePollination } from "#/hooks/usePollination";

export function PollenButton({
	bud,
}: {
	bud: {
		uri: string;
		author?: { did: string; displayName?: string; handle: string };
		pollenCount: number;
		viewerPollinated?: boolean;
	};
}) {
	const { canPollinate, pollinated, count, saving, errorMessage, toggle } =
		usePollination(
			bud.uri,
			bud.author?.did,
			bud.pollenCount,
			bud.viewerPollinated,
		);

	const authorLabel =
		bud.author?.displayName ??
		bud.author?.handle ??
		bud.author?.did ??
		"Anonymous";
	const label = errorMessage
		? `Could not pollinate: ${errorMessage}`
		: `${pollinated ? "Pollinated" : "Pollinate"} ${authorLabel}'s bud`;

	return (
		<button
			type="button"
			onClick={() => void toggle()}
			aria-pressed={pollinated}
			aria-label={label}
			title={label}
			disabled={!canPollinate || saving}
			data-errored={errorMessage ? true : undefined}
			className={pollinated ? "pollen is-pollinated" : "pollen"}
		>
			<Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
			<span className="pollen-count">{count}</span>
		</button>
	);
}
