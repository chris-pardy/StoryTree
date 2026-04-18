#!/usr/bin/env -S pnpm tsx
/**
 * Admin CLI for granting root `ink.branchline.seed` records in bulk.
 *
 * Credentials (app password) are stored in the macOS Keychain via the
 * `security` command — one entry per handle under service
 * `branchline-grant-seeds`. The active handle and its resolved PDS endpoint
 * are cached in ~/.config/branchline-grant-seeds.json so subsequent grants
 * don't need a handle argument or a DID-doc round trip.
 *
 * The caller's DID must be listed in the AppView's
 * `BRANCHLINE_ALLOWED_SEED_AUTHORS` env var; otherwise the Jetstream
 * indexer will reject the emitted seed records as `root-not-allowed`.
 *
 * Usage:
 *   pnpm grant-seeds login [handle]
 *   pnpm grant-seeds logout [handle]
 *   pnpm grant-seeds whoami
 *   pnpm grant-seeds grant [--expires <iso|duration>] [--count N] <handle...>
 *   pnpm grant-seeds grant --file <path.csv|.tsv>
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname } from "node:path";
import { createInterface } from "node:readline";
import { AtpAgent } from "@atproto/api";

const KEYCHAIN_SERVICE = "branchline-grant-seeds";
const CONFIG_PATH = `${homedir()}/.config/branchline-grant-seeds.json`;
const SEED_COLLECTION = "ink.branchline.seed";
const PLC_DIRECTORY_URL =
	process.env.PLC_DIRECTORY_URL ?? "https://plc.directory";
const FALLBACK_RESOLVER = "https://public.api.bsky.app";

type Config = {
	active?: string;
	accounts?: Record<string, { service: string; did: string }>;
};

function readConfig(): Config {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
	} catch {
		return {};
	}
}

function writeConfig(cfg: Config): void {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, {
		mode: 0o600,
	});
}

function keychainSet(account: string, password: string): void {
	const res = spawnSync(
		"security",
		[
			"add-generic-password",
			"-s",
			KEYCHAIN_SERVICE,
			"-a",
			account,
			"-w",
			password,
			"-U",
		],
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
	if (res.status !== 0) {
		throw new Error(`keychain write failed for ${account}`);
	}
}

function keychainGet(account: string): string | null {
	const res = spawnSync(
		"security",
		["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
		{ encoding: "utf8" },
	);
	if (res.status !== 0) return null;
	return res.stdout.replace(/\n$/, "");
}

function keychainDelete(account: string): boolean {
	const res = spawnSync(
		"security",
		["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account],
		{ stdio: "ignore" },
	);
	return res.status === 0;
}

function prompt(question: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

// Read a line from stdin without echoing characters. Used for the app
// password so it doesn't end up in scrollback or shell history if the user
// pastes on accident.
function promptHidden(question: string): Promise<string> {
	return new Promise((resolve) => {
		process.stdout.write(question);
		const stdin = process.stdin;
		const wasRaw = stdin.isTTY ? stdin.isRaw : false;
		if (stdin.isTTY) stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		let buf = "";
		const onData = (ch: string) => {
			for (const c of ch) {
				if (c === "\n" || c === "\r" || c === "\u0004") {
					if (stdin.isTTY) stdin.setRawMode(wasRaw);
					stdin.pause();
					stdin.off("data", onData);
					process.stdout.write("\n");
					resolve(buf);
					return;
				}
				if (c === "\u0003") {
					// Ctrl-C
					if (stdin.isTTY) stdin.setRawMode(wasRaw);
					process.stdout.write("\n");
					process.exit(130);
				}
				if (c === "\u007f" || c === "\b") {
					buf = buf.slice(0, -1);
				} else {
					buf += c;
				}
			}
		};
		stdin.on("data", onData);
	});
}

type DidDocument = {
	id?: unknown;
	service?: Array<{ id?: unknown; type?: unknown; serviceEndpoint?: unknown }>;
};

async function resolveHandleToDid(handle: string): Promise<string> {
	const url = new URL(
		"/xrpc/com.atproto.identity.resolveHandle",
		FALLBACK_RESOLVER,
	);
	url.searchParams.set("handle", handle);
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) {
		throw new Error(`resolveHandle ${handle}: HTTP ${res.status}`);
	}
	const body = (await res.json()) as { did?: unknown };
	if (typeof body.did !== "string") {
		throw new Error(`resolveHandle ${handle}: malformed response`);
	}
	return body.did;
}

async function resolveDidToPds(did: string): Promise<string> {
	let url: string;
	if (did.startsWith("did:plc:")) {
		url = `${PLC_DIRECTORY_URL}/${did}`;
	} else if (did.startsWith("did:web:")) {
		const host = decodeURIComponent(did.slice("did:web:".length).split(":")[0]);
		url = `https://${host}/.well-known/did.json`;
	} else {
		throw new Error(`unsupported DID method: ${did}`);
	}
	const res = await fetch(url, {
		headers: { accept: "application/did+json, application/json" },
	});
	if (!res.ok) throw new Error(`DID doc ${did}: HTTP ${res.status}`);
	const doc = (await res.json()) as DidDocument;
	for (const svc of doc.service ?? []) {
		const id = typeof svc.id === "string" ? svc.id : "";
		if (
			id.endsWith("#atproto_pds") &&
			typeof svc.serviceEndpoint === "string"
		) {
			return svc.serviceEndpoint;
		}
	}
	throw new Error(`DID doc ${did}: no atproto_pds service endpoint`);
}

// Accepts ISO-8601 datetimes or shorthand durations relative to now:
//   30d  (days), 12h (hours), 2w (weeks), 6mo (months), 1y (years)
function parseExpiration(input: string, now: Date): Date {
	const trimmed = input.trim();
	if (trimmed === "") throw new Error("empty expiration");

	const m = /^(\d+)(mo|[dhwy])$/.exec(trimmed);
	if (m) {
		const n = Number(m[1]);
		const unit = m[2];
		const d = new Date(now);
		switch (unit) {
			case "h":
				d.setUTCHours(d.getUTCHours() + n);
				break;
			case "d":
				d.setUTCDate(d.getUTCDate() + n);
				break;
			case "w":
				d.setUTCDate(d.getUTCDate() + n * 7);
				break;
			case "mo":
				d.setUTCMonth(d.getUTCMonth() + n);
				break;
			case "y":
				d.setUTCFullYear(d.getUTCFullYear() + n);
				break;
		}
		return d;
	}

	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`unparseable expiration: ${input}`);
	}
	return parsed;
}

type GrantRow = { handle: string; expiresAt: Date | null; count: number };

function parseCount(raw: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) {
		throw new Error(`count must be a positive integer, got: ${raw}`);
	}
	return n;
}

function parseDelimited(path: string): GrantRow[] {
	const ext = extname(path).toLowerCase();
	const delim = ext === ".tsv" ? "\t" : ",";
	const text = readFileSync(path, "utf8");
	const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
	if (lines.length === 0) return [];

	// Detect header: if the first field of row 0 looks like a column name
	// ("handle") rather than a handle (contains a dot), skip it.
	const first = lines[0].split(delim);
	const hasHeader = /^(handle|user|account)$/i.test(first[0].trim());
	const dataLines = hasHeader ? lines.slice(1) : lines;

	const rows: GrantRow[] = [];
	const now = new Date();
	for (const line of dataLines) {
		const cells = line.split(delim).map((c) => c.trim());
		const handle = cells[0];
		if (!handle) continue;
		const rawExp = cells[1] ?? "";
		const expiresAt = rawExp.length > 0 ? parseExpiration(rawExp, now) : null;
		const rawCount = cells[2] ?? "";
		const count = rawCount.length > 0 ? parseCount(rawCount) : 1;
		rows.push({ handle, expiresAt, count });
	}
	return rows;
}

async function cmdLogin(argHandle: string | undefined): Promise<void> {
	const handle = argHandle ?? (await prompt("handle: "));
	if (!handle) throw new Error("handle required");

	const password = await promptHidden("app password: ");
	if (!password) throw new Error("password required");

	console.log(`resolving ${handle}...`);
	const did = await resolveHandleToDid(handle);
	const service = await resolveDidToPds(did);
	console.log(`did: ${did}`);
	console.log(`pds: ${service}`);

	const agent = new AtpAgent({ service });
	await agent.login({ identifier: handle, password });
	console.log("login ok");

	keychainSet(handle, password);

	const cfg = readConfig();
	cfg.accounts = cfg.accounts ?? {};
	cfg.accounts[handle] = { service, did };
	cfg.active = handle;
	writeConfig(cfg);

	console.log(`stored credentials for ${handle} (active)`);
}

function cmdLogout(argHandle: string | undefined): void {
	const cfg = readConfig();
	const handle = argHandle ?? cfg.active;
	if (!handle) {
		console.log("no active account");
		return;
	}
	const deleted = keychainDelete(handle);
	if (cfg.accounts) delete cfg.accounts[handle];
	if (cfg.active === handle) {
		const remaining = Object.keys(cfg.accounts ?? {});
		cfg.active = remaining[0];
	}
	writeConfig(cfg);
	console.log(deleted ? `removed ${handle}` : `${handle} not found`);
}

function cmdWhoami(): void {
	const cfg = readConfig();
	if (!cfg.active) {
		console.log("not logged in");
		return;
	}
	const entry = cfg.accounts?.[cfg.active];
	console.log(`active: ${cfg.active}`);
	if (entry) {
		console.log(`did:    ${entry.did}`);
		console.log(`pds:    ${entry.service}`);
	}
	const accounts = Object.keys(cfg.accounts ?? {});
	if (accounts.length > 1) {
		console.log(`other:  ${accounts.filter((a) => a !== cfg.active).join(", ")}`);
	}
}

async function loadActiveAgent(): Promise<{ agent: AtpAgent; did: string }> {
	const cfg = readConfig();
	if (!cfg.active || !cfg.accounts?.[cfg.active]) {
		throw new Error("not logged in — run `pnpm grant-seeds login` first");
	}
	const handle = cfg.active;
	const { service, did } = cfg.accounts[handle];
	const password = keychainGet(handle);
	if (!password) {
		throw new Error(
			`no keychain entry for ${handle} — run \`pnpm grant-seeds login ${handle}\``,
		);
	}
	const agent = new AtpAgent({ service });
	await agent.login({ identifier: handle, password });
	return { agent, did };
}

type GrantArgs = {
	rows: GrantRow[];
	file?: string;
};

function parseGrantArgs(argv: string[]): GrantArgs {
	const handles: string[] = [];
	let expiresRaw: string | undefined;
	let countRaw: string | undefined;
	let file: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--expires" || a === "-e") {
			expiresRaw = argv[++i];
		} else if (a.startsWith("--expires=")) {
			expiresRaw = a.slice("--expires=".length);
		} else if (a === "--count" || a === "-n") {
			countRaw = argv[++i];
		} else if (a.startsWith("--count=")) {
			countRaw = a.slice("--count=".length);
		} else if (a === "--file" || a === "-f") {
			file = argv[++i];
		} else if (a.startsWith("--file=")) {
			file = a.slice("--file=".length);
		} else if (a.startsWith("-")) {
			throw new Error(`unknown flag: ${a}`);
		} else {
			handles.push(a);
		}
	}

	if (file && handles.length > 0) {
		throw new Error("pass either --file or handles, not both");
	}
	if (file && (expiresRaw || countRaw)) {
		throw new Error(
			"--expires / --count are ignored when --file is used (set per-row)",
		);
	}

	if (file) {
		return { rows: parseDelimited(file), file };
	}
	if (handles.length === 0) {
		throw new Error("no handles given");
	}

	const now = new Date();
	const expiresAt = expiresRaw ? parseExpiration(expiresRaw, now) : null;
	const count = countRaw ? parseCount(countRaw) : 1;
	return { rows: handles.map((h) => ({ handle: h, expiresAt, count })) };
}

async function cmdGrant(argv: string[]): Promise<void> {
	const { rows, file } = parseGrantArgs(argv);
	if (rows.length === 0) {
		console.log(`no rows to grant${file ? ` in ${file}` : ""}`);
		return;
	}

	const { agent, did } = await loadActiveAgent();
	const totalSeeds = rows.reduce((sum, r) => sum + r.count, 0);
	console.log(
		`granting as ${did} (${totalSeeds} seed${totalSeeds === 1 ? "" : "s"} across ${rows.length} recipient${rows.length === 1 ? "" : "s"})`,
	);

	let ok = 0;
	let fail = 0;
	for (const row of rows) {
		let granteeDid: string;
		try {
			granteeDid = await resolveHandleToDid(row.handle);
		} catch (err) {
			console.error(
				`  fail ${row.handle}: ${err instanceof Error ? err.message : String(err)}`,
			);
			fail += row.count;
			continue;
		}

		const exp = row.expiresAt ? ` expires=${row.expiresAt.toISOString()}` : "";
		for (let i = 0; i < row.count; i++) {
			try {
				const record: Record<string, unknown> = {
					$type: SEED_COLLECTION,
					grantee: granteeDid,
					createdAt: new Date().toISOString(),
				};
				if (row.expiresAt) record.expiresAt = row.expiresAt.toISOString();

				const resp = await agent.com.atproto.repo.createRecord({
					repo: did,
					collection: SEED_COLLECTION,
					record,
					validate: false,
				});
				const tag =
					row.count > 1 ? ` [${i + 1}/${row.count}]` : "";
				console.log(
					`  ok   ${row.handle}${tag} -> ${granteeDid}${exp} ${resp.data.uri}`,
				);
				ok++;
			} catch (err) {
				console.error(
					`  fail ${row.handle} [${i + 1}/${row.count}]: ${err instanceof Error ? err.message : String(err)}`,
				);
				fail++;
			}
		}
	}

	console.log(`done: ${ok} ok, ${fail} failed`);
	if (fail > 0) process.exitCode = 1;
}

function usage(): void {
	console.log(`branchline grant-seeds

  pnpm grant-seeds login [handle]             store credentials in Keychain
  pnpm grant-seeds logout [handle]            remove stored credentials
  pnpm grant-seeds whoami                     show active account
  pnpm grant-seeds grant [flags] <handle...>  publish root seeds
  pnpm grant-seeds grant --file path.csv|.tsv bulk-grant from file

Flags (positional mode):
  --expires, -e  expiration applied to every seed (see below)
  --count,   -n  number of seeds per handle (default 1)

Expiration (--expires or CSV column):
  30d, 12h, 2w, 6mo, 1y        — relative to now
  2026-12-31T00:00:00Z         — absolute ISO-8601
  omitted                      — never expires

CSV/TSV format (delimiter inferred from extension):
  handle,expiresAt,count
  alice.bsky.social,30d,1
  bob.bsky.social,,3
  carol.bsky.social,2026-12-31T00:00:00Z,`);
}

async function main(): Promise<void> {
	const [cmd, ...rest] = process.argv.slice(2);
	try {
		switch (cmd) {
			case "login":
				await cmdLogin(rest[0]);
				break;
			case "logout":
				cmdLogout(rest[0]);
				break;
			case "whoami":
				cmdWhoami();
				break;
			case "grant":
				await cmdGrant(rest);
				break;
			case undefined:
			case "--help":
			case "-h":
			case "help":
				usage();
				break;
			default:
				console.error(`unknown command: ${cmd}`);
				usage();
				process.exit(2);
		}
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

await main();
