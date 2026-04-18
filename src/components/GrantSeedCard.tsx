import "./BloomCard.css";
import "./SeedCard.css";
import { useQueryClient } from "@tanstack/react-query";
import { Sprout } from "lucide-react";
import { useState } from "react";
import type { SearchedActor } from "#/queries/handle-search";
import { queryKeys } from "#/queries/keys";
import { grantRootSeed } from "#/server/seeds/admin";
import { type GiftExpiry, SeedGiftPanel } from "./SeedGiftPanel";

const EXPIRY_MS: Record<GiftExpiry, number | null> = {
	"1w": 7 * 24 * 60 * 60 * 1000,
	"1m": 30 * 24 * 60 * 60 * 1000,
	"1y": 365 * 24 * 60 * 60 * 1000,
	never: null,
};

export function GrantSeedCard() {
	const [active, setActive] = useState(false);
	const [recipient, setRecipient] = useState<SearchedActor | null>(null);
	const [expiry, setExpiry] = useState<GiftExpiry>("1m");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const queryClient = useQueryClient();

	function reset() {
		setActive(false);
		setRecipient(null);
		setExpiry("1m");
		setError(null);
		setSuccess(null);
	}

	async function handleSubmit() {
		if (!recipient || saving) return;
		setSaving(true);
		setError(null);
		setSuccess(null);
		try {
			const ms = EXPIRY_MS[expiry];
			const expiresAt = ms
				? new Date(Date.now() + ms).toISOString()
				: undefined;
			await grantRootSeed({
				data: { grantee: recipient.did, expiresAt },
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.authorSeeds(recipient.did, 50),
			});
			setSuccess(
				`Seed granted to ${recipient.displayName || `@${recipient.handle}`}`,
			);
			setRecipient(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not grant this seed.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<article className={`bloom-card rise-in${active ? " is-expanded" : ""}`}>
			<header className="bloom-card-head">
				<span className="bloom-card-kicker">Admin · Grant a seed</span>
			</header>

			<h2 className="bloom-card-title">
				Grant a new <em>seed</em>
			</h2>

			{active ? (
				<>
					<SeedGiftPanel
						selected={recipient}
						onSelect={setRecipient}
						expiry={expiry}
						onExpiryChange={setExpiry}
					/>
					{error ? (
						<p className="seed-card-error" role="alert">
							{error}
						</p>
					) : null}
					{success ? (
						<output className="seed-card-error">{success}</output>
					) : null}
				</>
			) : (
				<div className="seed-card-hero" aria-hidden="true">
					<Sprout size={120} strokeWidth={1.1} />
				</div>
			)}

			<footer className="bloom-card-stats">
				<div className="seed-card-ctas">
					{active ? (
						<>
							<button
								type="button"
								className="seed-card-cta"
								onClick={reset}
								disabled={saving}
							>
								Cancel
							</button>
							<button
								type="button"
								className="seed-card-cta is-primary"
								disabled={!recipient || saving}
								onClick={() => void handleSubmit()}
							>
								{saving ? "Granting\u2026" : "Grant"}
							</button>
						</>
					) : (
						<button
							type="button"
							className="seed-card-cta is-primary"
							onClick={() => setActive(true)}
						>
							Grant seed
						</button>
					)}
				</div>
			</footer>
		</article>
	);
}
