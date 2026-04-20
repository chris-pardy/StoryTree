import { createServerFn } from "@tanstack/react-start";
import { getPublicUrl } from "./config";

/**
 * Returns the deployed public URL for use in route `head()` callbacks.
 * `head()` runs both server- and client-side, but `process.env.PUBLIC_URL`
 * isn't bundled to the client, so static pages that want absolute OG image
 * URLs lift this through their loader.
 */
export const loadSiteMeta = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ publicUrl: string }> => ({ publicUrl: getPublicUrl() }),
);
