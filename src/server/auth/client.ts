import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { getPublicUrl } from "../config";
import { sessionStore, stateStore } from "./stores";

// Scope: full CRUD on branchline's own collections (so users can edit or
// retract their own buds and pollen), but *create-only* on
// app.bsky.feed.post — the bluesky crosspost is one-shot fire-and-forget;
// we never edit or delete bsky posts on the user's behalf, so asking for
// update/delete there would be over-permissive.
//
// Per-collection `repo:` scopes are still stabilizing in the spec
// (April 2026); some PDSes may not honor them yet.
const WRITE_SCOPES: Array<{ nsid: string; actions: Array<string> }> = [
	{
		nsid: "ink.branchline.bud",
		actions: ["create", "update", "delete"],
	},
	{
		nsid: "ink.branchline.pollen",
		actions: ["create", "update", "delete"],
	},
	{
		nsid: "ink.branchline.seed",
		actions: ["create", "update", "delete"],
	},
	{
		nsid: "app.bsky.feed.post",
		actions: ["create"],
	},
];

export const SCOPE = [
	"atproto",
	...WRITE_SCOPES.map(
		({ nsid, actions }) =>
			`repo:${nsid}?${actions.map((a) => `action=${a}`).join("&")}`,
	),
].join(" ");

const PUBLIC_URL = getPublicUrl();
const HANDLE_RESOLVER_URL =
	process.env.HANDLE_RESOLVER_URL ?? "http://localhost:2584";

const isLoopback =
	PUBLIC_URL.startsWith("http://127.0.0.1") ||
	PUBLIC_URL.startsWith("http://localhost") ||
	PUBLIC_URL.startsWith("http://[::1]");

const callbackUrl = `${PUBLIC_URL}/api/auth/callback`;

// Loopback dev: the spec lets you skip hosting client metadata by using a
// magic `http://localhost` client_id with redirect_uri/scope as query params.
// Hosted prod: client_id is the URL where /api/client-metadata.json lives.
const clientId = isLoopback
	? `http://localhost?redirect_uri=${encodeURIComponent(
			callbackUrl,
		)}&scope=${encodeURIComponent(SCOPE)}`
	: `${PUBLIC_URL}/api/client-metadata.json`;

export const clientMetadata = {
	client_id: clientId,
	client_name: "branchline",
	client_uri: PUBLIC_URL,
	policy_uri: `${PUBLIC_URL}/policy`,
	redirect_uris: [callbackUrl] as [string, ...string[]],
	scope: SCOPE,
	grant_types: ["authorization_code", "refresh_token"] as [
		"authorization_code",
		"refresh_token",
	],
	response_types: ["code"] as ["code"],
	application_type: "web" as const,
	token_endpoint_auth_method: "none" as const,
	dpop_bound_access_tokens: true,
};

let _client: NodeOAuthClient | undefined;

export function getOAuthClient(): NodeOAuthClient {
	if (_client) return _client;
	_client = new NodeOAuthClient({
		clientMetadata,
		handleResolver: HANDLE_RESOLVER_URL,
		stateStore,
		sessionStore,
		// Required for local dev so the client will talk to `http://localhost`
		// OAuth servers. Must stay false in production.
		allowHttp: isLoopback,
	});
	return _client;
}
