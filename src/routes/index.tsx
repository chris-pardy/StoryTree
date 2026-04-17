import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { BloomFeed } from "#/components/BloomFeed";
import { DotPulse } from "#/components/DotPulse";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/")({
	component: Landing,
});

function Landing() {
	rootApi.useLoaderData();

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
				<Suspense fallback={<DotPulse />}>
					<BloomFeed sort="pollen" limit={20} />
				</Suspense>
			</section>
		</main>
	);
}
