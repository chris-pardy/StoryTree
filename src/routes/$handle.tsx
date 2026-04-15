import {
	Await,
	createFileRoute,
	getRouteApi,
	notFound,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { type Bloom, BloomCard } from "#/components/BloomCard";
import { listAuthorBlooms } from "#/server/blooms/author";
import { resolveProfileActor } from "#/server/identity/profile-actor";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/$handle")({
	loader: async ({ params }) => {
		const actor = await resolveProfileActor({ data: { param: params.handle } });
		if (!actor) throw notFound();
		const bloomsPromise = listAuthorBlooms({
			data: { actor: actor.did, limit: 50 },
		});
		return {
			did: actor.did,
			handle: actor.handle,
			displayName: actor.displayName,
			bloomsPromise,
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
	const { did: viewerDid } = rootApi.useLoaderData();
	const { handle, displayName, bloomsPromise } = Route.useLoaderData();
	const isDid = handle.startsWith("did:");
	const atHandle = isDid ? handle : `@${handle}`;
	const primary = displayName ?? atHandle;
	const loggedIn = Boolean(viewerDid);

	return (
		<main className="px-6 pb-28 pt-16 sm:pt-24">
			<section className="reading-column">
				<header className="reading-masthead rise-in">
					<p className="masthead-kicker">Profile</p>
					<h1 className="masthead-title">{primary}</h1>
					{displayName && (
						<p className="masthead-lede">
							<span className="author-link-handle">{atHandle}</span>
						</p>
					)}
				</header>
			</section>

			<section className="bloom-feed">
				<header className="bloom-feed-masthead rise-in">
					<p className="masthead-kicker">Blooms · latest in each branch</p>
					<h1 className="bloom-feed-title">Where {primary} left off</h1>
				</header>
				<Suspense fallback={<BloomListFallback />}>
					<Await promise={bloomsPromise}>
						{(blooms) => <BloomList blooms={blooms} loggedIn={loggedIn} />}
					</Await>
				</Suspense>
			</section>
		</main>
	);
}

function BloomList({
	blooms,
	loggedIn,
}: {
	blooms: Array<Bloom>;
	loggedIn: boolean;
}) {
	if (blooms.length === 0) {
		return <p className="bloom-feed-empty">No blooms yet.</p>;
	}
	return (
		<ul className="bloom-grid">
			{blooms.map((bloom) => (
				<li key={bloom.uri}>
					<BloomCard bloom={bloom} loggedIn={loggedIn} />
				</li>
			))}
		</ul>
	);
}

function BloomListFallback() {
	return <p className="bloom-feed-empty">Gathering blooms…</p>;
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
