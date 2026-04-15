import { createServerFn } from "@tanstack/react-start";
import { resolveActor, resolveDidFromHandle } from "./resolve";

/**
 * Profile-route loader helper: the `$handle` path segment can be either a
 * raw DID (`did:plc:…`, `did:web:…`) or a handle (`alice.bsky.social`).
 * Normalize to both forms in a single server roundtrip so the route can
 * render the canonical handle alongside the DID-keyed data load.
 *
 * Returns `null` when the handle can't be resolved to a DID.
 *
 * Lives in its own file (not alongside `resolveHandles` in `resolve.ts`) so
 * that routes importing this server fn don't drag the whole resolver module
 * — including its Node-only `@atproto-labs/handle-resolver-node` binding —
 * into the client bundle. The TanStack Start plugin tree-shakes handler-only
 * imports here, but can't strip top-level helpers in `resolve.ts`.
 */
export const resolveProfileActor = createServerFn({ method: "GET" })
	.inputValidator((args: { param: string }) => args)
	.handler(
		async ({
			data,
		}): Promise<{
			did: string;
			handle: string;
			displayName: string | null;
		} | null> => {
			const { param } = data;
			if (param.startsWith("did:")) {
				const actor = await resolveActor(param);
				return {
					did: param,
					handle: actor.handle ?? param,
					displayName: actor.displayName,
				};
			}
			const did = await resolveDidFromHandle(param);
			if (!did) return null;
			const actor = await resolveActor(did);
			return {
				did,
				handle: actor.handle ?? param,
				displayName: actor.displayName,
			};
		},
	);
