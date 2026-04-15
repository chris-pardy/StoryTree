import { createFileRoute, notFound } from "@tanstack/react-router";
import { BudPage, NotFoundBud } from "#/components/reading/BudPage";
import {
	composeBudTitle,
	fetchBudPath,
	fetchLeaf,
	parseBudShorthand,
} from "#/components/reading/bud-loader";
import { listFreshBuds } from "#/server/buds/fresh";

export const Route = createFileRoute("/bud/$")({
	loader: async ({ params }) => {
		const uri = parseBudShorthand(params._splat ?? "");
		if (!uri) throw notFound();
		const { story: leaf, rootTitle } = await fetchLeaf({ data: uri });
		const pathPromise = fetchBudPath({ data: { uri } });
		// Kick off alongside the path fetch; BudPage awaits via Suspense.
		// `excludeUri` keeps the current leaf out of its own "fresh on this tree"
		// rail.
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
