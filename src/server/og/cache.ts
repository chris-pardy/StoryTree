import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// OG renders are CPU-heavy (Satori → SVG → Resvg → PNG). A single viral share
// on social media can fan out into hundreds of crawler fetches in a few
// minutes, and without a server-side cache we re-render each one. The CDN
// cache-control already buys some headroom, but a disk cache here is cheap
// insurance for origin spikes and survives process restarts that flush an
// in-memory LRU.
const CACHE_DIR = join(tmpdir(), "branchline-og");

export const OG_CACHE_TTL_MS = 10 * 60 * 1000;

function keyToPath(key: string): string {
	const hash = createHash("sha256").update(key).digest("hex");
	return join(CACHE_DIR, `${hash}.png`);
}

export async function getOrRenderOgPng(
	key: string,
	render: () => Promise<Buffer>,
	ttlMs: number = OG_CACHE_TTL_MS,
): Promise<Buffer> {
	const path = keyToPath(key);
	try {
		const s = await stat(path);
		if (Date.now() - s.mtimeMs < ttlMs) {
			return await readFile(path);
		}
	} catch {
		// miss — fall through to render
	}
	const buf = await render();
	try {
		await mkdir(CACHE_DIR, { recursive: true });
		await writeFile(path, buf);
	} catch (err) {
		// Best-effort cache write — a full disk or read-only /tmp mustn't
		// break the response path.
		console.warn("[og-cache] write failed", err);
	}
	return buf;
}
