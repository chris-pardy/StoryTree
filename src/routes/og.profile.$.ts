import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/og/profile/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const [
					{ prisma },
					{ resolveActor, resolveDidFromHandle },
					{ getOrRenderOgPng },
					{ renderProfileOgPng },
				] = await Promise.all([
					import("#/db"),
					import("#/server/identity/resolve"),
					import("#/server/og/cache"),
					import("#/server/og/render"),
				]);

				const url = new URL(request.url);
				const raw = decodeURIComponent(
					url.pathname.replace(/^\/og\/profile\/?/, "").replace(/\.png$/, ""),
				);
				if (!raw) return notFoundPng();

				const did = raw.startsWith("did:")
					? raw
					: await resolveDidFromHandle(raw);
				if (!did) return notFoundPng();

				// Cache key is just the DID: counts and handle/displayName drift
				// slowly relative to the TTL, and the per-DID key guarantees that
				// two renders for the same profile collapse to one file on disk.
				const png = await getOrRenderOgPng(`profile:${did}`, async () => {
					// Mirrors `listAuthorBudsHandler`: an author's bloom is one of
					// their buds with no deeper descendant of theirs in the same
					// branch. A "planting" is a root bud (no parent).
					const [actor, bloomRows, plantingRows] = await Promise.all([
						resolveActor(did),
						prisma.$queryRaw<Array<{ count: bigint }>>`
							SELECT COUNT(*)::bigint AS count
							FROM "Bud" b
							WHERE b."authorDid" = ${did}
								AND NOT EXISTS (
									SELECT 1 FROM "Bud" d
									WHERE d."authorDid" = ${did}
										AND d.uri <> b.uri
										AND b.uri = ANY(d."pathUris")
								)
						`,
						prisma.$queryRaw<Array<{ count: bigint }>>`
							SELECT COUNT(*)::bigint AS count
							FROM "Bud" b
							WHERE b."authorDid" = ${did}
								AND b."parentUri" IS NULL
						`,
					]);
					return renderProfileOgPng({
						displayName: actor.displayName,
						handle: actor.handle ?? raw,
						bloomCount: Number(bloomRows[0]?.count ?? 0n),
						plantingCount: Number(plantingRows[0]?.count ?? 0n),
					});
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

function notFoundPng(): Response {
	return new Response("not found", {
		status: 404,
		headers: { "content-type": "text/plain" },
	});
}
