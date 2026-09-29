// @effect-diagnostics nodeBuiltinImport:off
import { execFile, execFileSync } from "node:child_process";
import { Schema } from "effect";
import type { Plugin } from "vite";

const FixtureDocuments = Schema.fromJsonString(
  Schema.Struct({
    official: Schema.String,
    custom: Schema.Record(Schema.String, Schema.String),
    revised: Schema.Record(Schema.String, Schema.String),
  }),
);

const exportDocuments = [
  "import { exportOfficialCatalog } from '@repo/catalog-official/service';",
  "import { Effect } from 'effect';",
  "import { customCatalogDocuments, revisedCustomCatalogDocuments } from './test/fixtures/custom-catalogs.ts';",
  "process.stdout.write(JSON.stringify({ official: await Effect.runPromise(exportOfficialCatalog), custom: customCatalogDocuments, revised: revisedCustomCatalogDocuments }));",
].join(" ");

type RegistryMode = "current" | "outage" | "revised";

const isRegistryMode = (value: string | null): value is RegistryMode =>
  value === "current" || value === "outage" || value === "revised";

/**
 * Serves the browser tests' registry: the official catalog at its hosted
 * path, custom catalogs under `/registry-test/custom/<name>.json`, a mode
 * switch (`current`, an official `outage`, or `revised` custom documents),
 * and a CLI parity endpoint.
 */
export const registryFixtureServer = (): Plugin => ({
  name: "registry-fixture-server",
  configureServer(server) {
    // Vite's Node config loader cannot run the workspace's TypeScript catalog
    // sources, so a Bun subprocess exports the documents as JSON.
    const documents = Schema.decodeSync(FixtureDocuments)(
      execFileSync("bun", ["-e", exportDocuments], {
        cwd: process.cwd(),
      }).toString(),
    );
    let mode: RegistryMode = "current";
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
            ["run", "../cli/test/fixtures/registry-parity.ts"],
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
        if (isRegistryMode(requested)) mode = requested;
        response.end(mode);
        return;
      }
      // Custom catalogs send no CORS headers, so only same-origin loads succeed.
      const custom = /^\/registry-test\/custom\/([a-z-]+)\.json/.exec(
        request.url ?? "",
      )?.[1];
      if (custom !== undefined) {
        const body =
          (mode === "revised" ? documents.revised[custom] : undefined) ??
          documents.custom[custom];
        if (body === undefined) {
          response.statusCode = 404;
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
        response.end(documents.official);
        return;
      }
      next();
    });
  },
});
