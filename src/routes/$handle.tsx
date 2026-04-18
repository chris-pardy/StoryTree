import "#/components/BloomFeed.css";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { AuthorLink } from "#/components/AuthorLink";
import { AuthorPlantingsList } from "#/components/AuthorPlantingsList";
import { BudCard } from "#/components/BudCard";
import { DotPulse } from "#/components/DotPulse";
import { PermissionPanel } from "#/components/PermissionPanel";
import { PillTabs } from "#/components/PillTabs";
import { authorBudsQuery } from "#/queries/author-buds";
import { checkPermissions } from "#/server/admin";
import { resolveProfileActor } from "#/server/identity/profile-actor";

const rootApi = getRouteApi("__root__");

type Tab = "blooms" | "plantings";

const PROFILE_TABS = [
	{ value: "blooms", label: "Blooms" },
	{ value: "plantings", label: "Plantings" },
] as const satisfies ReadonlyArray<{ value: Tab; label: string }>;

export const Route = createFileRoute("/$handle")({
	loader: async ({ params }) => {
		const [actor, viewerPerms] = await Promise.all([
			resolveProfileActor({ data: { param: params.handle } }),
			checkPermissions(),
		]);
		if (!actor) throw notFound();
		return {
			did: actor.did,
			handle: actor.handle,
			displayName: actor.displayName,
			canGrantPermissions: viewerPerms.canGrantPermissions,
		};
	},
	head: ({ loaderData }) => {
		const label = loaderData?.displayName ?? loaderData?.handle ?? "Profile";
		return { meta: [{ title: `${label} | Branchline` }] };
	},
	component: Profile,
	notFoundComponent: NotFoundProfile,
});

function Profile() {
	rootApi.useLoaderData();
	const { did, handle, displayName, canGrantPermissions } =
		Route.useLoaderData();
	const isDid = handle.startsWith("did:");
	const atHandle = isDid ? handle : `@${handle}`;
	const primary = displayName ?? atHandle;
	const [tab, setTab] = useState<Tab>("blooms");

	const kicker =
		tab === "blooms"
			? "Blooms · latest in each branch"
			: "Plantings · trees sown";
	const title =
		tab === "blooms" ? `Where ${primary} left off` : `What ${primary} planted`;

	return (
		<main className="px-6 pb-28 pt-16 sm:pt-24">
			<section className="reading-column">
				<header className="reading-masthead rise-in">
					<p className="masthead-kicker">Profile</p>
					<h1 className="masthead-title">{primary}</h1>
					{displayName && (
						<p className="masthead-lede">
							<AuthorLink
								did={did}
								handle={handle}
								displayName={displayName}
								className="author-link-handle"
							/>
						</p>
					)}
				</header>
				{canGrantPermissions && <PermissionPanel did={did} />}
			</section>

			<section className="bloom-feed">
				<header className="bloom-feed-masthead rise-in">
					<p className="masthead-kicker">{kicker}</p>
					<h1 className="bloom-feed-title">{title}</h1>
					<PillTabs
						label="Profile view"
						value={tab}
						onChange={setTab}
						tabs={PROFILE_TABS}
					/>
				</header>
				<Suspense fallback={<DotPulse />}>
					{tab === "blooms" ? (
						<AuthorBudsList did={did} />
					) : (
						<AuthorPlantingsList did={did} />
					)}
				</Suspense>
			</section>
		</main>
	);
}

function AuthorBudsList({ did }: { did: string }) {
	const { data: buds } = useSuspenseQuery(authorBudsQuery(did));

	if (buds.length === 0) {
		return <p className="bloom-feed-empty">No blooms yet.</p>;
	}

	return (
		<ul className="bloom-grid">
			{buds.map((bud) => (
				<li key={bud.bloom}>
					<BudCard uri={bud.bloom} rootUri={bud.root} />
				</li>
			))}
		</ul>
	);
}

function NotFoundProfile() {
	return (
		<main className="px-6 pb-28 pt-16 sm:pt-24">
			<section className="reading-column">
				<header className="reading-masthead rise-in">
					<p className="masthead-kicker">Profile</p>
					<h1 className="masthead-title">Not found</h1>
					<p className="masthead-lede">
						We couldn&rsquo;t resolve that handle to a branchline author.
					</p>
				</header>
			</section>
		</main>
	);
}
