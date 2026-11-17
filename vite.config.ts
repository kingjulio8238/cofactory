import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devApiProxy } from "./scripts/testing/dev-api-proxy.ts";
import { DurationSequencer } from "./scripts/testing/duration-sequencer.ts";
import { hostE2eOnly, portableE2eFiles } from "./scripts/testing/host-e2e.ts";
import { hostTimeout } from "./server/testing/host-timeout.ts";

// The About dialog's version, inlined at build time: the preload bridge is
// absent in dev.
const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

const root = fileURLToPath(new URL(".", import.meta.url));
const workers = Number(process.env.DUSK_VITEST_WORKERS) || 1;
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/** The desktop window's other pages live in src/windows/ but are served and built at the top, where the server, the
 * window and the packaged app load them: /rail (rail.html, the rail of places) and /ambient.html. */
const WINDOWS = "src/windows";
const PAGES = ["rail", "ambient"];
function windowPages(): Plugin {
  const named: Record<string, string> = { "/rail": "rail", "/rail.html": "rail", "/ambient.html": "ambient" };
  const dev: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? "";
    const at = url.indexOf("?");
    const page = named[at < 0 ? url : url.slice(0, at)];
    if (page) req.url = `/${WINDOWS}/${page}.html${at < 0 ? "" : url.slice(at)}`;
    next();
  };
  const preview: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url === "/rail" || req.url?.startsWith("/rail?")) req.url = `/rail.html${req.url.slice("/rail".length)}`;
    next();
  };
  return {
    name: "window-pages",
    configureServer: (server) => void server.middlewares.use(dev),
    configurePreviewServer: (server) => void server.middlewares.use(preview),
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const name of PAGES) {
          const file = bundle[`${WINDOWS}/${name}.html`];
          if (file?.type !== "asset") continue;
          delete bundle[`${WINDOWS}/${name}.html`];
          this.emitFile({ type: "asset", fileName: `${name}.html`, source: file.source });
        }
      },
    },
  };
}

/** About's Third-party notices: the upstream NOTICE (Apache 2.0 section 4(d)) served as /third-party-notices.txt, from one source. */
function thirdPartyNotices(): Plugin {
  const file = "third-party-notices.txt";
  const text = () => readFileSync(page("./third_party/openmausbot/NOTICE"), "utf8");
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== `/${file}`) return next();
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(text());
  };
  return {
    name: "third-party-notices",
    configureServer: (server) => void server.middlewares.use(serve),
    generateBundle() { this.emitFile({ type: "asset", fileName: file, source: text() }); },
  };
}

/** The app page paints a waiting mascot before its script has loaded. */

const include = [
  "apps/dashboard/server/**/*.test.ts",
  "apps/dashboard/tracker/**/*.test.ts",
  "apps/dashboard/src/admin/**/*.test.ts",
  "apps/cloud-service/**/*.test.ts",
  "server/**/*.test.ts",
  "electron/**/*.test.mjs",
  "apps/link-service/**/*.test.mjs",
  "src/**/*.test.ts",
  "shared/**/*.test.ts",
  "apps/companion/**/*.test.ts",
  "scripts/**/*.test.mjs",
  "scripts/**/*.test.ts",
];

/** The app is a dynamic import of src/main.tsx, found only once the entry and its imports have arrived and run: on a
 * slow link that is a second round of downloads. The page names it and what it imports, so both rounds go at once. */
function preloadApp(): Plugin {
  return {
    name: "preload-app",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle || !ctx.filename.endsWith("index.html")) return;
        const app = Object.values(ctx.bundle).find((file) => file.type === "chunk" && file.isDynamicEntry && file.moduleIds.some((id) => id.endsWith("/src/App.tsx")));
        if (!app || app.type !== "chunk") return;
        const named = (file: string) => html.includes(`/${file}"`);
        return [
          ...[app.fileName, ...app.imports].filter((file) => !named(file))
            .map((file) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `/${file}` }, injectTo: "head" as const })),
          ...[...(app.viteMetadata?.importedCss ?? [])].filter((file) => !named(file))
            .map((file) => ({ tag: "link", attrs: { rel: "preload", as: "style", crossorigin: true, href: `/${file}` }, injectTo: "head" as const })),
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), windowPages(), preloadApp(), thirdPartyNotices()],
  build: {
    rollupOptions: { input: { index: page("./index.html"), ...Object.fromEntries(PAGES.map((name) => [name, page(`./${WINDOWS}/${name}.html`)])) } },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: "node",
    include,
    // DUSK_VITEST_E2E=host (CI's Windows and macOS shards) leaves the e2e files that run on Linux only.
    exclude: [...configDefaults.exclude, ...(hostE2eOnly() ? portableE2eFiles(root, include) : [])],
    setupFiles: ["server/testing/setup.ts", "src/testing/all-locales.ts", "src/testing/quiet-canceled-animations.ts"],
    // dusk bot's own screens and names under test; the Cofactory ones switch it on where they are tested
    env: { VITE_COFACTORY: "0" },
    // One file at a time by default: the suite spawns fake provider CLIs and real
    // harness servers, which a laptop feels. CI sets its runner's count (scripts/ci-scope.mjs).
    fileParallelism: workers > 1,
    maxWorkers: workers,
    // --shard splits the files by recorded CI seconds, not count
    sequence: { sequencer: DurationSequencer },
    // Known flakes in scripts/testing/ci-retry-list.json get two retries in
    // CI only, each reported.
    runner: "./scripts/testing/ci-retry-runner.ts",
    // Doubled on Windows, whose runners are about 1.45x slower.
    testTimeout: hostTimeout(20_000),
    hookTimeout: hostTimeout(30_000),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // IPv4 explicitly — a bare ::1 bind makes localhost a coin-flip for
    // clients that resolve IPv4 first
    host: "127.0.0.1",
    port: Number(process.env.DUSK_UI_PORT) || 5199,
    // the desktop window also runs this dev UI on a server's origin (electron/local-ui.mjs), so the client is told
    // where hot reload lives instead of reaching for the page's host
    hmr: { protocol: "ws", host: "127.0.0.1", clientPort: Number(process.env.DUSK_UI_PORT) || 5199 },
    // packager output lands inside the repo — its HTML files must never
    // trigger dev full-page reloads
    watch: {
      ignored: ["**/release/**", "**/build/**", "**/dist/**", "**/electron/resources/**", "**/.claude/**"],
    },
    // the harness server owns every provider process; the app only ever
    // talks to /api — clients hold no transports
    proxy: {
      "/api": devApiProxy(process.env.DUSK_PORT || 8799),
      "/.well-known/duskbot/environment": {
        target: `http://127.0.0.1:${process.env.DUSK_PORT || 8799}`,
      },
    },
  },
});
