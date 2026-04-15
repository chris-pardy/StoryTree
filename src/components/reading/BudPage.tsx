import { Await } from "@tanstack/react-router";
import { Suspense } from "react";
import type { Bud } from "../BudCard";
import { FreshBudsStrip } from "./FreshBudsStrip";
import { ReadingColumn } from "./ReadingColumn";
import type { Story } from "./types";

export function BudPage({
	leaf,
	pathPromise,
	freshBudsPromise,
}: {
	leaf: Story;
	pathPromise: Promise<Array<Story>>;
	freshBudsPromise: Promise<Array<Bud>>;
}) {
	const trailing = (
		<Suspense fallback={null}>
			<Await promise={freshBudsPromise}>
				{(buds) => <FreshBudsStrip buds={buds} />}
			</Await>
		</Suspense>
	);

	return (
		<Suspense
			fallback={<ReadingColumn initialStories={[leaf]} trailing={trailing} />}
		>
			<Await promise={pathPromise}>
				{(stories) => (
					<ReadingColumn initialStories={stories} trailing={trailing} />
				)}
			</Await>
		</Suspense>
	);
}

export function NotFoundBud() {
	return (
		<main className="reading-column px-6 pt-24">
			<p className="masthead-kicker">404</p>
			<h1 className="masthead-title">Not a bud we know.</h1>
		</main>
	);
}
