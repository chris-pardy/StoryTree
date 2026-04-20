#!/usr/bin/env -S pnpm tsx
/**
 * Render the parameter-free brand OG card to `public/og/site.png` so it can
 * be served as a static asset (no satori + resvg work per request).
 *
 * Re-run after editing `renderSiteOgPng` in `src/server/og/render.tsx`:
 *
 *   pnpm render-site-og
 *
 * The output file is committed; the static-asset path `/og/site.png` is what
 * the head() helpers in `src/lib/og-meta.ts` already point at.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSiteOgPng } from "../src/server/og/render";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../public/og/site.png");

const png = await renderSiteOgPng();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes)`);
