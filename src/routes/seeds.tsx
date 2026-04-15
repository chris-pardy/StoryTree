import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { IfLoggedIn, IfLoggedOut } from "#/components/auth/gates";

export const Route = createFileRoute("/seeds")({ component: SeedsPage });

/**
 * Dummy seed grants for the UI shell. Each row here is what a real
 * `ink.branchline.seedGrant` record addressed to the current viewer will
 * eventually look like — an unspent invitation that can be planted (to
 * produce a bud) or gifted onward to another atproto handle. The real list
 * will be fetched from the appview once the grant lexicon + indexer land.
 */
type Seed = {
	id: string;
	giftedBy: string;
	giftedAt: string;
	note?: string;
};

const DUMMY_SEEDS: Seed[] = [
	{
		id: "seed-01",
		giftedBy: "branchline.ink",
		giftedAt: "2026-04-10T14:22:00Z",
		note: "For the April anthology.",
	},
	{
		id: "seed-02",
		giftedBy: "rosalind.bsky.social",
		giftedAt: "2026-04-12T09:05:00Z",
	},
	{
		id: "seed-03",
		giftedBy: "branchline.ink",
		giftedAt: "2026-04-14T21:40:00Z",
		note: "Use it when the mood strikes.",
	},
];

type View =
	| { kind: "list" }
	| { kind: "plant"; seed: Seed }
	| { kind: "gift"; seed: Seed };

function SeedsPage() {
	const [view, setView] = useState<View>({ kind: "list" });
	const [seeds, setSeeds] = useState<Seed[]>(DUMMY_SEEDS);
	const returnTo = useRouterState({
		select: (s) => s.location.pathname,
	});

	const handlePlanted = (seed: Seed) => {
		// Dummy: remove the seed from the list and return to it.
		setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
		setView({ kind: "list" });
	};

	const handleGifted = (seed: Seed) => {
		// Dummy: remove the seed from the list and return to it.
		setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
		setView({ kind: "list" });
	};

	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<IfLoggedOut>
				<header className="reading-masthead rise-in">
					<h1 className="masthead-title">Seeds</h1>
					<p className="masthead-lede">
						Seeds are invitations to start a story on branchline. Sign in to see
						any you&rsquo;ve been gifted.
					</p>
					<p className="masthead-lede">
						<Link to="/login" search={{ returnTo }} className="continue-prompt">
							↳ sign in
						</Link>
					</p>
				</header>
			</IfLoggedOut>

			<IfLoggedIn>
				{view.kind === "list" && (
					<SeedList
						seeds={seeds}
						onPlant={(seed) => setView({ kind: "plant", seed })}
						onGift={(seed) => setView({ kind: "gift", seed })}
					/>
				)}
				{view.kind === "plant" && (
					<PlantSeedView
						seed={view.seed}
						onBack={() => setView({ kind: "list" })}
						onPlanted={() => handlePlanted(view.seed)}
					/>
				)}
				{view.kind === "gift" && (
					<GiftSeedView
						seed={view.seed}
						onBack={() => setView({ kind: "list" })}
						onGifted={() => handleGifted(view.seed)}
					/>
				)}
			</IfLoggedIn>
		</main>
	);
}

function SeedList({
	seeds,
	onPlant,
	onGift,
}: {
	seeds: Seed[];
	onPlant: (seed: Seed) => void;
	onGift: (seed: Seed) => void;
}) {
	return (
		<>
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">Your seeds</p>
				<h1 className="masthead-title">
					{seeds.length === 0 ? (
						<>No seeds, yet.</>
					) : (
						<>
							{seeds.length} {seeds.length === 1 ? "seed" : "seeds"} to plant.
						</>
					)}
				</h1>
				<p className="masthead-lede">
					A seed is an invitation to start a new story. You can plant it —
					turning it into the opening bud of a tree — or gift it on to someone
					else.
				</p>
			</header>

			{seeds.length === 0 ? (
				<p className="seed-empty rise-in" style={{ animationDelay: "160ms" }}>
					When someone gifts you a seed, it will show up here.
				</p>
			) : (
				<ul className="seed-list rise-in" style={{ animationDelay: "160ms" }}>
					{seeds.map((seed) => (
						<li key={seed.id} className="seed-card">
							<div className="seed-card-meta">
								<span className="seed-card-from">
									from <em>{seed.giftedBy}</em>
								</span>
								<span className="seed-card-when">
									{formatGiftedAt(seed.giftedAt)}
								</span>
							</div>
							{seed.note && <p className="seed-card-note">{seed.note}</p>}
							<div className="seed-card-actions">
								<button
									type="button"
									className="seed-card-action"
									onClick={() => onPlant(seed)}
								>
									plant →
								</button>
								<button
									type="button"
									className="seed-card-action"
									onClick={() => onGift(seed)}
								>
									gift ↗
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

function PlantSeedView({
	seed,
	onBack,
	onPlanted,
}: {
	seed: Seed;
	onBack: () => void;
	onPlanted: () => void;
}) {
	const [title, setTitle] = useState("");
	const [saving, setSaving] = useState(false);

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
				placeholder: "Begin a story…",
			}),
		],
		content: "",
		immediatelyRender: false,
	});

	const submit = () => {
		if (!editor || saving) return;
		if (editor.isEmpty && !title.trim()) return;
		setSaving(true);
		// Dummy: pretend to publish. The real implementation will call a
		// publishSeed server fn that writes an ink.branchline.bud record
		// referencing this seed's grant uri, then atomically marks the grant
		// spent in the appview.
		setTimeout(() => {
			setSaving(false);
			onPlanted();
		}, 400);
	};

	const handleContainerKey = (e: React.KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			submit();
		} else if (e.key === "Escape" && !saving) {
			e.preventDefault();
			onBack();
		}
	};

	return (
		<>
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">
					Planting a seed from <em>{seed.giftedBy}</em>
				</p>
				<h1 className="masthead-title">
					Write the
					<br />
					<em>first bud.</em>
				</h1>
				<p className="masthead-lede">
					This bud becomes the root of a new tree. Anyone can read down from it
					and extend the story. Up to 500 words.
				</p>
			</header>

			<form
				className="continue-editor rise-in"
				style={{ animationDelay: "160ms" }}
				onKeyDown={handleContainerKey}
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<input
					type="text"
					className="continue-title-input"
					placeholder="A title for the first bud…"
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
					<button
						type="button"
						className="continue-submit"
						onClick={onBack}
						disabled={saving}
					>
						← back
					</button>
					<span className="continue-hint" aria-hidden="true">
						{saving ? "planting…" : "⌘↵ to plant · esc to go back"}
					</span>
					<button
						type="button"
						className="continue-submit"
						onClick={submit}
						disabled={saving}
					>
						{saving ? "planting…" : "plant ↵"}
					</button>
				</div>
			</form>
		</>
	);
}

function GiftSeedView({
	seed,
	onBack,
	onGifted,
}: {
	seed: Seed;
	onBack: () => void;
	onGifted: () => void;
}) {
	const [handle, setHandle] = useState("");
	const [saving, setSaving] = useState(false);

	const submit = () => {
		if (saving) return;
		if (!handle.trim()) return;
		setSaving(true);
		// Dummy: pretend to pass the grant. The real implementation will resolve
		// the handle to a did and write a new ink.branchline.seedGrant record to
		// the viewer's own pds whose `previous` points at this seed's uri and
		// whose `recipient` is the resolved did.
		setTimeout(() => {
			setSaving(false);
			onGifted();
		}, 400);
	};

	return (
		<>
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">
					Gifting a seed from <em>{seed.giftedBy}</em>
				</p>
				<h1 className="masthead-title">
					Pass it
					<br />
					<em>onward.</em>
				</h1>
				<p className="masthead-lede">
					Enter an atproto handle. Once they accept the gift the seed moves to
					their list, and you won&rsquo;t be able to plant it yourself.
				</p>
			</header>

			<form
				className="seed-gift-form rise-in"
				style={{ animationDelay: "160ms" }}
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label className="seed-gift-label" htmlFor="seed-gift-handle">
					Recipient handle
				</label>
				<input
					id="seed-gift-handle"
					type="text"
					className="seed-gift-input"
					placeholder="alice.bsky.social"
					value={handle}
					onChange={(e) => setHandle(e.target.value)}
					disabled={saving}
					autoComplete="off"
					spellCheck={false}
				/>
				<div className="continue-submit-row">
					<button
						type="button"
						className="continue-submit"
						onClick={onBack}
						disabled={saving}
					>
						← back
					</button>
					<span className="continue-hint" aria-hidden="true">
						{saving ? "gifting…" : "enter a handle"}
					</span>
					<button
						type="submit"
						className="continue-submit"
						disabled={saving || !handle.trim()}
					>
						{saving ? "gifting…" : "gift ↵"}
					</button>
				</div>
			</form>
		</>
	);
}

function formatGiftedAt(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
