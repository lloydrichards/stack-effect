import { execFile, execFileSync } from "node:child_process";
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
            "import { exportOfficialCatalog } from '@repo/catalog-official/service'; import { Effect } from 'effect'; process.stdout.write(await Effect.runPromise(exportOfficialCatalog));",
          ],
          { cwd: process.cwd() },
        ).toString();
        const revisedCatalog = JSON.parse(document) as {
          targets: Array<{
            kind: string;
            title: string;
            contributions: Array<{
              _tag: string;
              path?: string;
              contents?: string;
            }>;
          }>;
        };
        revisedCatalog.targets = revisedCatalog.targets.map((target) => ({
          ...target,
          title: `${target.title} revised`,
          contributions:
            target.kind === "client-react"
              ? target.contributions.map((contribution) =>
                  contribution._tag === "file" &&
                  contribution.path === "{{targetPath}}/src/main.tsx"
                    ? {
                        ...contribution,
                        contents: `${contribution.contents}\n// Registry revision marker.\n`,
                      }
                    : contribution,
                )
              : target.contributions,
        }));
        const revisedDocument = JSON.stringify(revisedCatalog);
        const customDocuments = JSON.parse(
          execFileSync(
            "bun",
            [
              "-e",
              "import { customCatalogDocuments } from './test/fixtures/custom-catalogs.ts'; process.stdout.write(JSON.stringify(customCatalogDocuments));",
            ],
            { cwd: process.cwd() },
          ).toString(),
        ) as Record<string, string>;
        // Custom catalogs send no CORS headers, so only same-origin loads succeed.
        const customOutages = new Set<string>();
        let mode: "current" | "outage" | "invalid" | "revised" = "current";
        server.middlewares.use((request, response, next) => {
          if (
            request.url === "/registry-test/cli-parity" &&
            request.method === "POST"
          ) {
            const chunks: Array<Buffer> = [];
            request.on("data", (chunk: Buffer) => chunks.push(chunk));
            request.on("end", () => {
              // Asynchronous so this server can still serve the custom catalogs
              // the CLI fetches while the fixture runs.
              const child = execFile(
                "bun",
                ["run", "../cli/scripts/registry-parity.ts"],
                { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 },
                (error, stdout, stderr) => {
                  if (error !== null) {
                    response.statusCode = 500;
                    response.end(`CLI parity fixture failed: ${stderr}`);
                    return;
                  }
                  response.setHeader("content-type", "application/json");
                  response.end(stdout);
                },
              );
              child.stdin?.end(Buffer.concat(chunks));
            });
            return;
          }
          if (request.url?.startsWith("/registry-test/mode")) {
            const requested = new URL(
              request.url,
              "http://localhost",
            ).searchParams.get("value");
            if (
              requested === "current" ||
              requested === "outage" ||
              requested === "invalid" ||
              requested === "revised"
            )
              mode = requested;
            response.end(mode);
            return;
          }
          if (request.url?.startsWith("/registry-test/custom-mode")) {
            const params = new URL(request.url, "http://localhost")
              .searchParams;
            const name = params.get("name") ?? "";
            if (params.get("value") === "outage") customOutages.add(name);
            else customOutages.delete(name);
            response.end(params.get("value") ?? "");
            return;
          }
          const custom = /^\/registry-test\/custom\/([a-z-]+)\.json/.exec(
            request.url ?? "",
          )?.[1];
          if (custom !== undefined) {
            const body = customDocuments[custom];
            if (customOutages.has(custom) || body === undefined) {
              response.statusCode = body === undefined ? 404 : 503;
              response.end();
              return;
            }
            response.setHeader("content-type", "application/json");
            response.end(body);
            return;
          }
          if (request.url?.startsWith("/registry/v1/catalog.json")) {
            if (mode === "outage") {
              response.statusCode = 503;
              response.end();
              return;
            }
            response.setHeader("content-type", "application/json");
            response.end(
              mode === "invalid"
                ? '{"formatVersion":2}'
                : mode === "revised"
                  ? revisedDocument
                  : document,
            );
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
