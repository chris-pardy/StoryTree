import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import { Branch } from "#/components/Branch";
import { DotPulse } from "#/components/DotPulse";
import { parseBudShorthand, parseBudSplat } from "#/lib/bud-uri";
import { loadBudMeta } from "#/server/buds/load-meta";

export const Route = createFileRoute("/bud/$")({
	loader: async ({ params }) => {
		const uri = parseBudShorthand(params._splat ?? "");
		if (!uri) throw notFound();
		const meta = await loadBudMeta({ data: { uri } });
		return { uri, meta };
	},
	head: ({ loaderData }) => {
		const meta = loaderData?.meta;
		if (!meta) return { meta: [{ title: "Branchline" }] };
		const splat = parseBudSplat(loaderData.uri);
		const authorLabel = meta.authorDisplayName?.trim()
			? `${meta.authorDisplayName} (@${meta.authorHandle})`
			: `@${meta.authorHandle}`;
		const pageUrl = `${meta.publicUrl}/bud/${splat}`;
		const imageUrl = `${meta.publicUrl}/og/bud/${splat}.png`;
		const description = meta.preview
			? `${meta.preview} — by ${authorLabel} on Branchline`
			: `A bud by ${authorLabel} on Branchline`;
		const title = `${meta.title} · Branchline`;
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:type", content: "article" },
				{ property: "og:title", content: meta.title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: pageUrl },
				{ property: "og:image", content: imageUrl },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ property: "og:site_name", content: "Branchline" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: meta.title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:image", content: imageUrl },
			],
		};
	},
	component: BudPage,
	notFoundComponent: NotFoundBud,
});

function BudPage() {
	const { _splat } = Route.useParams();
	const uri = parseBudShorthand(_splat ?? "");

	if (!uri) return <NotFoundBud />;

	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<Suspense fallback={<DotPulse />}>
				<Branch uri={uri} />
			</Suspense>
		</main>
	);
}

function NotFoundBud() {
	return (
		<main className="reading-column px-6 pt-24">
			<p className="masthead-kicker">404</p>
			<h1 className="masthead-title">Not a bud we know.</h1>
		</main>
	);
}
