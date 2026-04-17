import type { SearchedActor } from "#/queries/handle-search";
import { HandleSearch } from "./HandleSearch";

export type GiftExpiry = "1w" | "1m" | "1y";

const EXPIRY_OPTIONS: ReadonlyArray<{ value: GiftExpiry; label: string }> = [
	{ value: "1w", label: "1 week" },
	{ value: "1m", label: "1 month" },
	{ value: "1y", label: "1 year" },
];

export function SeedGiftPanel({
	selected,
	onSelect,
	expiry,
	onExpiryChange,
}: {
	selected: SearchedActor | null;
	onSelect: (actor: SearchedActor | null) => void;
	expiry: GiftExpiry;
	onExpiryChange: (next: GiftExpiry) => void;
}) {
	if (!selected) {
		return (
			<div className="seed-card-panel is-search">
				<HandleSearch autoFocus onSelect={onSelect} />
			</div>
		);
	}

	return (
		<div className="seed-card-panel">
			<div className="seed-card-panel-recipient-row">
				<div className="seed-card-panel-recipient-meta">
					<p className="seed-card-panel-kicker">Gifting to</p>
					<p className="seed-card-panel-recipient">
						{selected.displayName || `@${selected.handle}`}
					</p>
					{selected.displayName && (
						<p className="seed-card-panel-handle">@{selected.handle}</p>
					)}
				</div>
				<button
					type="button"
					className="seed-card-panel-change"
					onClick={() => onSelect(null)}
				>
					Change
				</button>
			</div>
			<div
				className="seed-card-expiry"
				role="radiogroup"
				aria-label="Gift expiry"
			>
				<p className="seed-card-panel-kicker">Expires in</p>
				<div className="seed-card-expiry-options">
					{EXPIRY_OPTIONS.map((opt) => (
						<label
							key={opt.value}
							className={`seed-card-expiry-option${
								expiry === opt.value ? " is-active" : ""
							}`}
						>
							<input
								type="radio"
								name="seed-gift-expiry"
								value={opt.value}
								checked={expiry === opt.value}
								onChange={() => onExpiryChange(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</div>
			</div>
		</div>
	);
}
