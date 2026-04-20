#!/usr/bin/env -S pnpm tsx
/**
 * Publishes every lexicon JSON under `lexicons/` to the authenticated
 * account's repo as a `com.atproto.lexicon.schema` record, using the
 * lexicon's `id` (NSID) as the rkey.
 *
 * Credentials come from env vars (set in `.env.local`) or an interactive
 * prompt. The password prompt is hidden.
 *
 *   BRANCHLINE_LEXICON_IDENTIFIER     handle or DID
 *   BRANCHLINE_LEXICON_APP_PASSWORD   app password
 *   BRANCHLINE_LEXICON_SERVICE        PDS URL (default https://bsky.social)
 *   BRANCHLINE_LEXICON_PREFIX         NSID prefix to publish (default
 *                                     `ink.branchline.`). Vendored schemas
 *                                     like `com.atproto.*` are skipped unless
 *                                     this is overridden.
 *
 * Usage:
 *   pnpm lex:publish
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { AtpAgent } from "@atproto/api";

const COLLECTION = "com.atproto.lexicon.schema";
const DEFAULT_SERVICE = "https://bsky.social";
const DEFAULT_PREFIX = "ink.branchline.";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..");
const LEXICON_DIR = join(REPO_ROOT, "lexicons");

async function main() {
	const identifier = (
		await resolveCredential(
			"BRANCHLINE_LEXICON_IDENTIFIER",
			"Handle or DID",
			false,
		)
	).trim();
	const password = await resolveCredential(
		"BRANCHLINE_LEXICON_APP_PASSWORD",
		"App password",
		true,
	);
	const service = process.env.BRANCHLINE_LEXICON_SERVICE ?? DEFAULT_SERVICE;
	const prefix = process.env.BRANCHLINE_LEXICON_PREFIX ?? DEFAULT_PREFIX;

	if (!identifier) throw new Error("identifier is empty");
	if (!password) throw new Error("password is empty");

	const agent = new AtpAgent({ service });
	await agent.login({ identifier, password });
	const did = agent.session?.did;
	if (!did) throw new Error("login succeeded but session has no DID");

	const files = await findLexiconFiles(LEXICON_DIR);
	if (files.length === 0) {
		console.log(`no lexicon files under ${relative(REPO_ROOT, LEXICON_DIR)}`);
		return;
	}

	// Parse + filter by NSID prefix so vendored schemas (e.g. `com.atproto.*`
	// copied in for code generation) don't get published under our DID.
	const candidates: Array<{ file: string; id: string; lexicon: unknown }> = [];
	for (const file of files) {
		const rel = relative(REPO_ROOT, file);
		const raw = await readFile(file, "utf8");
		let lexicon: unknown;
		try {
			lexicon = JSON.parse(raw);
		} catch (err) {
			console.warn(
				`  skip ${rel}: invalid JSON (${err instanceof Error ? err.message : err})`,
			);
			continue;
		}
		const id = (lexicon as { id?: unknown })?.id;
		if (typeof id !== "string" || id.length === 0) {
			console.warn(`  skip ${rel}: missing string "id"`);
			continue;
		}
		if (!id.startsWith(prefix)) {
			continue;
		}
		candidates.push({ file, id, lexicon });
	}

	if (candidates.length === 0) {
		console.log(`no lexicons matched prefix "${prefix}"`);
		return;
	}

	console.log(
		`Publishing ${candidates.length} lexicon${candidates.length === 1 ? "" : "s"} (prefix "${prefix}") to ${service} as ${did}`,
	);

	let failures = 0;
	for (const { file, id, lexicon } of candidates) {
		const rel = relative(REPO_ROOT, file);
		try {
			await agent.com.atproto.repo.putRecord({
				repo: did,
				collection: COLLECTION,
				rkey: id,
				record: lexicon as Record<string, unknown>,
				validate: false,
			});
			console.log(`  published ${id}  (${rel})`);
		} catch (err) {
			console.error(
				`  failed ${id}: ${err instanceof Error ? err.message : err}`,
			);
			failures += 1;
		}
	}

	if (failures > 0) {
		console.error(`\n${failures} lexicon(s) did not publish`);
		process.exit(1);
	}
}

async function findLexiconFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await findLexiconFiles(full)));
		} else if (entry.isFile() && extname(entry.name) === ".json") {
			out.push(full);
		}
	}
	return out.sort();
}

async function resolveCredential(
	envVar: string,
	label: string,
	hidden: boolean,
): Promise<string> {
	const existing = process.env[envVar];
	if (existing) return existing;
	if (!process.stdin.isTTY) {
		throw new Error(
			`${envVar} is not set and stdin is not a TTY — cannot prompt`,
		);
	}
	return hidden ? promptHidden(`${label}: `) : promptVisible(`${label}: `);
}

function promptVisible(label: string): Promise<string> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise<string>((resolve) => {
		rl.question(label, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

function promptHidden(label: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		process.stdout.write(label);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");
		const canRaw = typeof process.stdin.setRawMode === "function";
		if (canRaw) process.stdin.setRawMode(true);
		let buf = "";
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				if (ch === "\n" || ch === "\r") {
					cleanup();
					process.stdout.write("\n");
					resolve(buf);
					return;
				}
				if (ch === "\u0003") {
					cleanup();
					process.stdout.write("\n");
					reject(new Error("cancelled"));
					return;
				}
				if (ch === "\u0004") {
					cleanup();
					process.stdout.write("\n");
					resolve(buf);
					return;
				}
				if (ch === "\u007f" || ch === "\b") {
					if (buf.length > 0) buf = buf.slice(0, -1);
				} else {
					buf += ch;
				}
			}
		};
		const cleanup = () => {
			process.stdin.off("data", onData);
			if (canRaw) process.stdin.setRawMode(false);
			process.stdin.pause();
		};
		process.stdin.on("data", onData);
	});
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
