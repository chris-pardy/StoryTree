import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

// TanStack Start would otherwise wait for the first HTTP request before
// evaluating src/server.ts — too late for the in-process jetstream subscriber,
// which needs to start at server boot. This plugin calls ssrLoadModule once
// the dev HTTP server is listening, forcing the module body (and its
// bootJetstreamSubscriber() side effect) to run immediately.
function warmServerEntryPlugin(): PluginOption {
	return {
		name: "branchline:warm-server-entry",
		apply: "serve",
		configureServer(server) {
			const warm = () => {
				server
					.ssrLoadModule("/src/server.ts")
					.catch((err) =>
						server.config.logger.error(
							`[warm-server-entry] failed to load src/server.ts: ${err}`,
						),
					);
			};
			if (server.httpServer) {
				server.httpServer.once("listening", warm);
			} else {
				// Middleware mode has no httpServer — warm on next tick so plugin
				// setup has finished.
				queueMicrotask(warm);
			}
		},
	};
}

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
		warmServerEntryPlugin(),
	],
});

export default config;
