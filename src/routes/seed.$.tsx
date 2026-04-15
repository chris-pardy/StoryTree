import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { IfLoggedIn, IfLoggedOut } from "#/components/auth/gates";
import { parseFullAtUri } from "#/components/reading/bud-loader";
import { type DummySeed, findDummySeed, formatGiftedAt } from "#/seeds/dummy";

/**
 * Per-seed detail page. Keyed by the grant's at:// URI in the splat so
 * every seed has a canonical, shareable URL. Once the protocol lands this
 * loader will:
 *
 *   1. Look the grant up in `SeedGrantNode`; backfill from the holder's
 *      PDS via com.atproto.repo.getRecord if we don't have it cached.
 *   2. Walk the chain back to a root, verifying `holder.did ==
 *      previous.recipient` at each hop and that the root is held by a DID
 *      in BRANCHLINE_TRUSTED_GRANTORS.
 *   3. Return the grant plus a discriminant telling the component which
 *      actions to show: info / holder / spent / invalid.
 *
 * For now the loader just matches against the hardcoded dummy seeds.
 * Action-gating still happens client-side via the IfLoggedIn gate — we
 * don't yet know whose session is whose in the dummy data.
 */
export const Route = createFileRoute("/seed/$")({
	loader: ({ params }) => {
		const uri = parseFullAtUri(params._splat ?? "");
		if (!uri) throw notFound();
		const seed = findDummySeed(uri);
		if (!seed) throw notFound();
		return { seed };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `Seed from ${loaderData?.seed.giftedBy ?? "branchline"} | Branchline`,
			},
		],
	}),
	component: SeedDetailPage,
	notFoundComponent: NotFoundSeed,
});

type Action = "none" | "plant" | "gift";

function SeedDetailPage() {
	const { seed } = Route.useLoaderData();
	const [action, setAction] = useState<Action>("none");

	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			{action === "none" && (
				<SeedInfo
					seed={seed}
					onPlant={() => setAction("plant")}
					onGift={() => setAction("gift")}
				/>
			)}
			{action === "plant" && (
				<PlantSeedView seed={seed} onBack={() => setAction("none")} />
			)}
			{action === "gift" && (
				<GiftSeedView seed={seed} onBack={() => setAction("none")} />
			)}
		</main>
	);
}

function SeedInfo({
	seed,
	onPlant,
	onGift,
}: {
	seed: DummySeed;
	onPlant: () => void;
	onGift: () => void;
}) {
	return (
		<>
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">A seed</p>
				<h1 className="masthead-title">
					from <em>{seed.giftedBy}</em>
				</h1>
				<p className="masthead-lede">
					{seed.note ??
						"An invitation to start a new story on branchline. Plant it to open the first bud of a tree, or gift it onward."}
				</p>
				<p className="seed-detail-meta">
					Gifted {formatGiftedAt(seed.giftedAt)}
				</p>
			</header>

			<IfLoggedOut>
				<p
					className="seed-detail-cta rise-in"
					style={{ animationDelay: "160ms" }}
				>
					Sign in with the atproto handle this seed was addressed to, to plant
					or gift it.
				</p>
			</IfLoggedOut>

			<IfLoggedIn>
				<div
					className="seed-detail-actions rise-in"
					style={{ animationDelay: "160ms" }}
				>
					<button type="button" className="seed-card-action" onClick={onPlant}>
						plant →
					</button>
					<button type="button" className="seed-card-action" onClick={onGift}>
						gift ↗
					</button>
					<Link to="/seeds" className="seed-card-action">
						← all seeds
					</Link>
				</div>
			</IfLoggedIn>
		</>
	);
}

function PlantSeedView({
	seed,
	onBack,
}: {
	seed: DummySeed;
	onBack: () => void;
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
		// Dummy: pretend to publish. The real implementation will call the
		// ink.branchline.publishSeed procedure, which writes an
		// ink.branchline.bud record referencing this seed's grant uri and
		// atomically commits the chain in the appview.
		setTimeout(() => {
			setSaving(false);
			onBack();
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
}: {
	seed: DummySeed;
	onBack: () => void;
}) {
	const [handle, setHandle] = useState("");
	const [saving, setSaving] = useState(false);

	const submit = () => {
		if (saving) return;
		if (!handle.trim()) return;
		setSaving(true);
		// Dummy: pretend to pass the grant. The real flow will resolve the
		// handle to a did and write a new ink.branchline.seedGrant record to
		// the viewer's own pds whose `previous` strong-refs this seed and
		// whose `recipient` is the resolved did.
		setTimeout(() => {
			setSaving(false);
			onBack();
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
					Enter an atproto handle. Once you gift the seed it moves to their
					list, and you won&rsquo;t be able to plant it yourself.
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

function NotFoundSeed() {
	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<header className="reading-masthead rise-in">
				<h1 className="masthead-title">Seed not found</h1>
				<p className="masthead-lede">
					This at:// URI doesn&rsquo;t match any seed the AppView knows about.
				</p>
				<p className="masthead-lede">
					<Link to="/seeds" className="continue-prompt">
						↳ back to your seeds
					</Link>
				</p>
			</header>
		</main>
	);
}
