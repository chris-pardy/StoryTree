import "./BloomCard.css";
import "./SeedCard.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Nut, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useViewerDid } from "#/components/auth/gates";
import { ContinueEditor, type Draft } from "#/components/reading/ContinueStory";
import { parseBudSplat } from "#/lib/bud-uri";
import type { SearchedActor } from "#/queries/handle-search";
import { queryKeys } from "#/queries/keys";
import { seedQuery } from "#/queries/seeds";
import { publishBud } from "#/server/buds/publish";
import { publishSeed } from "#/server/seeds/publish";
import { AuthorLink } from "./AuthorLink";
import { type GiftExpiry, SeedGiftPanel } from "./SeedGiftPanel";

const EXPIRY_MS: Record<GiftExpiry, number | null> = {
	"1w": 7 * 24 * 60 * 60 * 1000,
	"1m": 30 * 24 * 60 * 60 * 1000,
	"1y": 365 * 24 * 60 * 60 * 1000,
	never: null,
};

type Mode = "idle" | "gift" | "plant";

function relative(ts: string) {
	const ms = Date.now() - new Date(ts).getTime();
	const hours = Math.round(ms / 3_600_000);
	if (hours < 1) return "just now";
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

function expiresIn(ts: string): string | null {
	const ms = new Date(ts).getTime() - Date.now();
	if (ms <= 0) return "expired";
	const hours = Math.round(ms / 3_600_000);
	if (hours < 24) return `${hours}h left`;
	const days = Math.round(hours / 24);
	return `${days}d left`;
}

export function SeedCard({
	uri,
	onSendGift,
	onPlant,
}: {
	uri: string;
	onSendGift?: (args: { seedUri: string; recipient: SearchedActor }) => void;
	onPlant?: (uri: string) => void;
}) {
	const { data: seed } = useQuery(seedQuery(uri));
	const [mode, setMode] = useState<Mode>("idle");
	const [recipient, setRecipient] = useState<SearchedActor | null>(null);
	const [expiry, setExpiry] = useState<GiftExpiry>("1w");
	const [plantSaving, setPlantSaving] = useState(false);
	const [plantError, setPlantError] = useState<string | null>(null);
	const [giftSaving, setGiftSaving] = useState(false);
	const [giftError, setGiftError] = useState<string | null>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const viewerDid = useViewerDid();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (mode === "plant" && !dialog.open) {
			dialog.showModal();
		} else if (mode !== "plant" && dialog.open) {
			dialog.close();
		}
	}, [mode]);

	if (!seed) return null;

	const expiryLabel = seed.expiresAt ? expiresIn(seed.expiresAt) : null;

	function reset() {
		setMode("idle");
		setRecipient(null);
		setExpiry("1w");
		setPlantError(null);
		setGiftError(null);
	}

	async function handleGiftSubmit() {
		if (!seed || !recipient || giftSaving) return;
		setGiftSaving(true);
		setGiftError(null);
		try {
			const ms = EXPIRY_MS[expiry];
			const expiresAt = ms
				? new Date(Date.now() + ms).toISOString()
				: undefined;
			await publishSeed({
				data: {
					grantor: seed.uri,
					grantee: recipient.did,
					expiresAt,
				},
			});
			if (viewerDid) {
				queryClient.invalidateQueries({
					queryKey: queryKeys.authorSeeds(viewerDid, 50),
				});
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.seed(seed.uri) });
			onSendGift?.({ seedUri: seed.uri, recipient });
			reset();
		} catch (e) {
			setGiftError(
				e instanceof Error ? e.message : "Could not gift this seed.",
			);
		} finally {
			setGiftSaving(false);
		}
	}

	async function handlePlantSubmit(draft: Draft) {
		if (plantSaving || !seed) return;
		setPlantSaving(true);
		setPlantError(null);
		try {
			const { uri: newBudUri } = await publishBud({
				data: {
					parentUri: seed.uri,
					title: draft.title,
					text: draft.text,
					formatting: draft.formatting,
				},
			});
			if (viewerDid) {
				queryClient.invalidateQueries({
					queryKey: queryKeys.authorSeeds(viewerDid, 50),
				});
				queryClient.invalidateQueries({
					queryKey: queryKeys.authorPlantings(viewerDid, 50),
				});
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.seed(seed.uri) });
			onPlant?.(seed.uri);
			setPlantSaving(false);
			reset();
			navigate({
				to: "/bud/$",
				params: { _splat: parseBudSplat(newBudUri) },
			});
		} catch (e) {
			setPlantError(
				e instanceof Error ? e.message : "Could not plant this seed.",
			);
			setPlantSaving(false);
		}
	}

	return (
		<article
			className={`bloom-card rise-in${mode === "gift" ? " is-expanded" : ""}`}
		>
			<header className="bloom-card-head">
				<span className="bloom-card-kicker">
					Seed · granted {relative(seed.createdAt)}
				</span>
			</header>

			<h2 className="bloom-card-title">A seed to plant</h2>

			<p className="bloom-card-authors">
				from{" "}
				<AuthorLink
					did={seed.grantedBy.did}
					handle={seed.grantedBy.handle}
					displayName={seed.grantedBy.displayName}
					className="bloom-card-handle"
				/>
			</p>

			{mode === "gift" ? (
				<>
					<SeedGiftPanel
						selected={recipient}
						onSelect={setRecipient}
						expiry={expiry}
						onExpiryChange={setExpiry}
					/>
					{giftError ? (
						<p className="seed-card-error" role="alert">
							{giftError}
						</p>
					) : null}
				</>
			) : (
				<div className="seed-card-hero" aria-hidden="true">
					<Nut size={120} strokeWidth={1.1} />
				</div>
			)}

			<footer className="bloom-card-stats">
				<span className="bloom-card-stat">{expiryLabel ?? "no expiry"}</span>
				<div className="seed-card-ctas">
					{mode === "idle" ? (
						<>
							<button
								type="button"
								className="seed-card-cta"
								onClick={() => setMode("gift")}
							>
								Gift
							</button>
							<button
								type="button"
								className="seed-card-cta is-primary"
								onClick={() => setMode("plant")}
							>
								Plant
							</button>
						</>
					) : mode === "gift" ? (
						<>
							<button
								type="button"
								className="seed-card-cta"
								onClick={reset}
								disabled={giftSaving}
							>
								Cancel
							</button>
							<button
								type="button"
								className="seed-card-cta is-primary"
								disabled={!recipient || giftSaving}
								onClick={() => void handleGiftSubmit()}
							>
								{giftSaving ? "Sending…" : "Send"}
							</button>
						</>
					) : null}
				</div>
			</footer>

			<dialog ref={dialogRef} className="seed-plant-overlay" onClose={reset}>
				{mode === "plant" ? (
					<div className="seed-plant-overlay-body">
						<button
							type="button"
							className="seed-plant-overlay-close"
							onClick={reset}
							disabled={plantSaving}
							aria-label="Close"
						>
							<X size={16} strokeWidth={1.8} aria-hidden="true" />
						</button>
						<header className="reading-masthead">
							<p className="masthead-kicker">Plant this seed</p>
							<h2 className="masthead-title">
								Begin a new
								<br />
								<em>story tree.</em>
							</h2>
							<p className="masthead-byline">
								from{" "}
								<AuthorLink
									did={seed.grantedBy.did}
									handle={seed.grantedBy.handle}
									displayName={seed.grantedBy.displayName}
									className="masthead-handle"
								/>
							</p>
						</header>
						<ContinueEditor
							onSubmit={handlePlantSubmit}
							onCancel={reset}
							saving={plantSaving}
							error={plantError}
						/>
					</div>
				) : null}
			</dialog>
		</article>
	);
}
