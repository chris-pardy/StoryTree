import { createFileRoute } from "@tanstack/react-router";
import { parseBudShorthand } from "#/lib/bud-uri";
import { hydrateBuds } from "#/server/buds/hydrate";
import { resolveDidFromHandle } from "#/server/identity/resolve";
import { renderBudOgPng } from "#/server/og/render";

export const Route = createFileRoute("/og/bud/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				// Splat lives after "/og/bud/" — strip the .png suffix if present so
				// crawlers can use either `/og/bud/<handle>/<rkey>` or
				// `/og/bud/<handle>/<rkey>.png`.
				const raw = decodeURIComponent(
					url.pathname.replace(/^\/og\/bud\/?/, "").replace(/\.png$/, ""),
				);

				const uri = await resolveBudUri(raw);
				if (!uri) return notFoundPng();

				const [bud] = await hydrateBuds([uri]);
				if (!bud) return notFoundPng();

				const png = await renderBudOgPng({
					title: bud.title,
					authorDisplayName: bud.author.displayName ?? null,
					authorHandle: bud.author.handle,
					childCount: bud.children?.length ?? 0,
					pollenCount: bud.pollenCount,
				});

				return new Response(new Uint8Array(png), {
					headers: {
						"content-type": "image/png",
						"cache-control":
							"public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
					},
				});
			},
		},
	},
});

async function resolveBudUri(splat: string): Promise<string | null> {
	const direct = parseBudShorthand(splat);
	if (!direct) return null;
	// parseBudShorthand accepts either a DID or a handle as the identifier.
	// hydrateBuds keys on DID-based AT-URIs, so resolve handles first.
	const match = direct.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
	if (!match) return null;
	const [, identifier, collection, rkey] = match;
	if (identifier.startsWith("did:")) return direct;
	const did = await resolveDidFromHandle(identifier);
	if (!did) return null;
	return `at://${did}/${collection}/${rkey}`;
}

function notFoundPng(): Response {
	return new Response("not found", {
		status: 404,
		headers: { "content-type": "text/plain" },
	});
}
