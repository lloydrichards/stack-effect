// This test fixture runs the real CLI in a disposable repository.
// @effect-diagnostics nodeBuiltinImport:off

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { CatalogService } from "@repo/catalog";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import {
  BlueprintService,
  CatalogCache,
  CatalogLoader,
  RecipeService,
} from "@repo/scaffold";
import { RecipePreviewInput } from "@repo/scaffold/recipe-preview";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";

const request = Schema.decodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      input: RecipePreviewInput,
      command: Schema.String,
      addTarget: Schema.optional(Schema.String),
    }),
  ),
)(await Bun.stdin.text());

const sourceUrl = "https://fixture.example.test/registry/v1/catalog.json";
const document = await Effect.runPromise(exportOfficialCatalog);
// Custom catalogs in the selection are served by the browser test's fixture server.
const client = Layer.effect(
  HttpClient.HttpClient,
  Effect.map(HttpClient.HttpClient, (network) =>
    HttpClient.make((httpRequest) =>
      httpRequest.url === sourceUrl
        ? Effect.succeed(
            HttpClientResponse.fromWeb(
              httpRequest,
              new Response(document, {
                headers: { "content-type": "application/json" },
              }),
            ),
          )
        : network.execute(httpRequest),
    ),
  ),
).pipe(Layer.provide(FetchHttpClient.layer));
const loaderLayer = CatalogLoader.layer.pipe(
  Layer.provideMerge(CatalogCache.memory),
  Layer.provideMerge(client),
  Layer.provideMerge(NodeServices.layer),
);

// Built in-process from the same catalog; the CLI run below supplies only the files.
const expectedBlueprint = await Effect.runPromise(
  Effect.gen(function* () {
    const { catalog } = yield* (yield* CatalogLoader).loadSources({
      sources: request.input.config.catalogSources,
      officialUrl: sourceUrl,
    });
    return yield* Effect.gen(function* () {
      const selection = yield* (yield* RecipeService).resolve(
        request.input.recipe,
        {
          config: request.input.config,
          providerStrategy: { _tag: "fail-on-ambiguous" },
        },
      );
      return yield* (yield* BlueprintService).resolve(
        selection,
        request.input.config,
      );
    }).pipe(
      Effect.provide(
        Layer.merge(RecipeService.layer, BlueprintService.layer).pipe(
          Layer.provideMerge(Layer.succeed(CatalogService, catalog)),
        ),
      ),
    );
  }).pipe(Effect.provide(loaderLayer)),
);

const temporaryRoot = mkdtempSync(join(tmpdir(), "registry-cli-parity-"));
try {
  const stubDirectory = join(temporaryRoot, "stubs");
  mkdirSync(stubDirectory);
  // Exercise CLI file application without running generated-project installs.
  for (const binary of ["bun", "npm", "npx", "node", "deno", "git"]) {
    const stub = join(stubDirectory, binary);
    writeFileSync(stub, "#!/bin/sh\nexit 0\n");
    chmodSync(stub, 0o755);
  }

  // Whole-word single quotes (such as --catalog name=url) are unwrapped;
  // anything needing a real shell parser is outside the controlled recipes.
  const words = request.command
    .split(" ")
    .map((word) => (/^'[^']*'$/.test(word) ? word.slice(1, -1) : word));
  const createAt = words.indexOf("create");
  if (createAt < 0 || words.some((word) => word.includes("'")))
    throw new Error(
      "The controlled recipe must provide an unquoted create command.",
    );
  const env = {
    ...Bun.env,
    PATH: `${stubDirectory}:${Bun.env["PATH"] ?? ""}`,
  };
  const run = (args: ReadonlyArray<string>) => {
    const result = Bun.spawnSync(
      [process.execPath, "run", "e2e/entrypoint.ts", ...args],
      { cwd: join(import.meta.dir, "../.."), env, timeout: 60_000 },
    );
    if (result.exitCode !== 0)
      throw new Error(
        `CLI ${args[0]} failed: ${result.stderr.toString()}\n${result.stdout.toString()}`,
      );
  };
  run([...words.slice(createAt), "--yes", "--root", temporaryRoot]);
  const projectRoot = join(temporaryRoot, request.input.config.name);
  if (request.addTarget !== undefined)
    run(["add", "--yes", "--root", projectRoot, "--target", request.addTarget]);

  const filesIn = (directory: string): ReadonlyArray<string> =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesIn(path) : [path];
    });
  const files = filesIn(projectRoot)
    .map((path) => ({
      path: relative(projectRoot, path),
      status: "created" as const,
      contents: readFileSync(path, "utf8"),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  process.stdout.write(JSON.stringify({ expectedBlueprint, files }));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
