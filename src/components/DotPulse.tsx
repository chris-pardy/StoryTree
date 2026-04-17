import "./DotPulse.css";

export function DotPulse() {
	return (
		<output className="dot-pulse" aria-label="Loading">
			<span className="dot-pulse-dot" />
			<span className="dot-pulse-dot" />
			<span className="dot-pulse-dot" />
		</output>
	);
}
