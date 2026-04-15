import {
	Await,
	createFileRoute,
	getRouteApi,
	Link,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { type Bloom, BloomCard } from "#/components/BloomCard";
import { listBlooms } from "#/server/blooms/feed";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/")({
	loader: () => ({
		bloomsPromise: listBlooms({ data: { sort: "pollen", limit: 20 } }),
	}),
	component: Landing,
});

function Landing() {
	const { did } = rootApi.useLoaderData();
	const { bloomsPromise } = Route.useLoaderData();
	const loggedIn = Boolean(did);

	return (
		<main className="px-6 pb-28 pt-16 sm:pt-24">
			<section className="reading-column">
				<header className="reading-masthead rise-in">
					<p className="masthead-kicker">What is branchline?</p>
					<h1 className="masthead-title">
						Stories grow
						<br />
						<em>in branches.</em>
					</h1>
					<p className="masthead-lede">
						It&rsquo;s a place to grow stories together, one bloom at a time.
						Read a path down through the tree. Pick up where the last writer
						left off. Watch stories become branches.
					</p>
					<p className="masthead-lede">
						<Link to="/about">More about branchline →</Link>
					</p>
				</header>
			</section>

			<section className="bloom-feed">
				<header className="bloom-feed-masthead rise-in">
					<p className="masthead-kicker">Blooms · in season</p>
					<h1 className="bloom-feed-title">Stories blooming now</h1>
				</header>
				<Suspense fallback={<BloomFeedFallback />}>
					<Await promise={bloomsPromise}>
						{(blooms) => <BloomFeed blooms={blooms} loggedIn={loggedIn} />}
					</Await>
				</Suspense>
			</section>
		</main>
	);
}

function BloomFeed({
	blooms,
	loggedIn,
}: {
	blooms: Array<Bloom>;
	loggedIn: boolean;
}) {
	if (blooms.length === 0) {
		return <p className="bloom-feed-empty">No blooms yet. Check back later.</p>;
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

function BloomFeedFallback() {
	return <p className="bloom-feed-empty">Gathering today&rsquo;s blooms…</p>;
}
