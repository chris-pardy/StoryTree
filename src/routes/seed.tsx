import "#/components/BloomFeed.css";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { AuthorPlantingsList } from "#/components/AuthorPlantingsList";
import { AuthorSeedsList } from "#/components/AuthorSeedsList";
import { useViewerDid } from "#/components/auth/gates";
import { DotPulse } from "#/components/DotPulse";
import { GrantSeedCard } from "#/components/GrantSeedCard";
import { PillTabs } from "#/components/PillTabs";
import { checkPermissions } from "#/server/admin";

export const Route = createFileRoute("/seed")({
	component: SeedPage,
	loader: () => checkPermissions(),
});

type Tab = "ready" | "rooted";

const SEED_TABS = [
	{ value: "ready", label: "Ready to plant" },
	{ value: "rooted", label: "Already rooted" },
] as const satisfies ReadonlyArray<{ value: Tab; label: string }>;

function SeedPage() {
	const viewerDid = useViewerDid();
	const { canGrantSeeds } = Route.useLoaderData();
	const [tab, setTab] = useState<Tab>("ready");

	const kicker = tab === "ready" ? "Ready to plant" : "Already rooted";
	const title =
		tab === "ready" ? "Seeds you can plant" : "Seeds you’ve planted";

	return (
		<main className="px-6 pb-28 pt-16 sm:pt-24">
			<section className="reading-column">
				<header className="reading-masthead rise-in">
					<p className="masthead-kicker">Your seeds</p>
					<h1 className="masthead-title">
						Seeds you&rsquo;ve
						<br />
						<em>gathered.</em>
					</h1>
					<p className="masthead-lede">
						Planting a seed is the first step to watching story trees grow.
					</p>
				</header>
			</section>

			{canGrantSeeds && (
				<section className="bloom-feed">
					<header className="bloom-feed-masthead rise-in">
						<p className="masthead-kicker">Admin</p>
						<h2 className="bloom-feed-title">Grant seeds</h2>
					</header>
					<ul className="bloom-grid">
						<li>
							<GrantSeedCard />
						</li>
					</ul>
				</section>
			)}

			<section className="bloom-feed">
				<header className="bloom-feed-masthead rise-in">
					<p className="masthead-kicker">{kicker}</p>
					<h2 className="bloom-feed-title">{title}</h2>
					<PillTabs
						label="Seed view"
						value={tab}
						onChange={setTab}
						tabs={SEED_TABS}
					/>
				</header>
				{!viewerDid ? (
					<p className="bloom-feed-empty">
						{tab === "ready"
							? "Sign in to see seeds waiting for you."
							: "You haven’t planted a seed yet."}
					</p>
				) : tab === "ready" ? (
					<Suspense fallback={<DotPulse />}>
						<AuthorSeedsList did={viewerDid} />
					</Suspense>
				) : (
					<Suspense fallback={<DotPulse />}>
						<AuthorPlantingsList
							did={viewerDid}
							emptyLabel="You haven’t planted a seed yet."
						/>
					</Suspense>
				)}
			</section>
		</main>
	);
}
