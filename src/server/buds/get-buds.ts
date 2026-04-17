import { createServerFn } from "@tanstack/react-start";
import type * as GetBudsTypes from "../../generated/lexicons/types/ink/branchline/getBuds";
import { hydrateBuds } from "./hydrate";

export async function getBudsHandler(args: {
	uris: string[];
}): Promise<GetBudsTypes.OutputSchema> {
	const { uris } = args;
	if (uris.length === 0) return { buds: [] };
	if (uris.length > 25) throw new Error("Maximum 25 URIs per request");
	const buds = await hydrateBuds(uris);
	return { buds };
}

export const getBuds = createServerFn({ method: "GET" })
	.inputValidator((args: { uris: string[] }) => args)
	.handler(async ({ data }) => getBudsHandler(data));
