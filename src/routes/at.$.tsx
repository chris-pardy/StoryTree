import { createFileRoute, notFound } from "@tanstack/react-router";
import { BudPage, NotFoundBud } from "#/components/reading/BudPage";
import {
	composeBudTitle,
	fetchBudPath,
	fetchLeaf,
	parseFullAtUri,
} from "#/components/reading/bud-loader";
import { listFreshBuds } from "#/server/buds/fresh";

export const Route = createFileRoute("/at/$")({
	loader: async ({ params }) => {
		const uri = parseFullAtUri(params._splat ?? "");
		if (!uri) throw notFound();
		// Await the leaf so 404 fires before the SSR shell flushes, and so the
		// Suspense fallback has something to render. The full path fetch is
		// started but deliberately NOT awaited — TanStack Router recognises the
		// promise and streams it through React 18 deferred SSR.
		const { story: leaf, rootTitle } = await fetchLeaf({ data: uri });
		const pathPromise = fetchBudPath({ data: { uri } });
		// Fresh siblings under the same root. Chained off the path so we use
		// the resolved root URI; BudPage awaits via Suspense. `excludeUri` keeps
		// the current leaf out of its own "fresh on this tree" rail.
		const freshBudsPromise = pathPromise.then((stories) => {
			const root = stories[0];
			if (!root) return [];
			return listFreshBuds({
				data: { ancestorUri: root.id, excludeUri: uri },
			});
		});
		return { leaf, rootTitle, pathPromise, freshBudsPromise };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${composeBudTitle(loaderData?.rootTitle, loaderData?.leaf.title)} | Branchline`,
			},
		],
	}),
	component: Bud,
	notFoundComponent: NotFoundBud,
});

function Bud() {
	const { leaf, pathPromise, freshBudsPromise } = Route.useLoaderData();
	return (
		<BudPage
			leaf={leaf}
			pathPromise={pathPromise}
			freshBudsPromise={freshBudsPromise}
		/>
	);
}
