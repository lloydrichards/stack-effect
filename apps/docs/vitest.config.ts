import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "catalog-browser-fixture",
      configureServer(server) {
        const document = execFileSync(
          "bun",
          [
            "-e",
            "import { exportOfficialCatalog } from '@repo/catalog/authoring'; import { Effect } from 'effect'; process.stdout.write(await Effect.runPromise(exportOfficialCatalog()));",
          ],
          { cwd: process.cwd() },
        ).toString();
        let mode: "current" | "outage" | "invalid" = "current";
        server.middlewares.use((request, response, next) => {
          if (request.url?.startsWith("/registry-test/mode")) {
            const requested = new URL(
              request.url,
              "http://localhost",
            ).searchParams.get("value");
            if (
              requested === "current" ||
              requested === "outage" ||
              requested === "invalid"
            )
              mode = requested;
            response.end(mode);
            return;
          }
          if (request.url?.startsWith("/registry/v1/catalog.json")) {
            if (mode === "outage") {
              response.statusCode = 503;
              response.end();
              return;
            }
            response.setHeader("content-type", "application/json");
            response.end(mode === "invalid" ? '{"formatVersion":2}' : document);
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: [
      "@effect/platform-browser/BrowserWorkerRunner",
      "@repo/scaffold/browser",
      "shiki/langs/dockerfile.mjs",
      "shiki/langs/dotenv.mjs",
      "shiki/langs/javascript.mjs",
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.unit.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
