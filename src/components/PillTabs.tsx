import "./PillTabs.css";

export type PillTab<T extends string> = {
	value: T;
	label: string;
};

export function PillTabs<T extends string>({
	value,
	onChange,
	tabs,
	label,
}: {
	value: T;
	onChange: (next: T) => void;
	tabs: ReadonlyArray<PillTab<T>>;
	label: string;
}) {
	return (
		<div className="pill-tabs" role="tablist" aria-label={label}>
			{tabs.map((tab) => (
				<button
					key={tab.value}
					type="button"
					role="tab"
					aria-selected={value === tab.value}
					className={`pill-tab${value === tab.value ? " is-active" : ""}`}
					onClick={() => onChange(tab.value)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
