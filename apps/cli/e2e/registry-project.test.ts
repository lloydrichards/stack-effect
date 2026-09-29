// @effect-diagnostics nodeBuiltinImport:off
// oxlint-disable-next-line effecttsgo/node-builtin-import -- NodeHttpServer.layer requires the Node server factory.
import { createServer } from "node:http";
import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { exportAuthorCatalog } from "@repo/catalog-author/service";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { HttpServer, HttpServerResponse } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { CLI } from "./harness";

/**
 * Acceptance test for the registry project the author catalog generates.
 *
 * The project must work from a clean directory outside this checkout. Its
 * dependencies point at packed tarballs of the current author package and CLI,
 * so the test exercises this commit rather than the last release.
 */

const repoRoot = new URL("../../../", import.meta.url).pathname;
const registry = "reg/apps/catalog-registry";
const catalogFile = `${registry}/dist/registry/v1/catalog.json`;

type Spawner = ChildProcessSpawner["Service"];

const run = (spawner: Spawner, cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const [command = "", ...rest] = args;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, rest, { cwd, stdout: "pipe", stderr: "pipe" }),
    );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: "unbounded" },
    );
    return { stdout, stderr, exitCode };
  }).pipe(Effect.scoped, Effect.orDie);

const expectSuccess = (
  spawner: Spawner,
  cwd: string,
  args: ReadonlyArray<string>,
) =>
  run(spawner, cwd, args).pipe(
    Effect.tap((result) =>
      result.exitCode === 0
        ? Effect.void
        : Effect.die(
            new Error(
              `${args.join(" ")} failed (exit ${result.exitCode})\n${result.stdout.slice(-2000)}\n${result.stderr.slice(-2000)}`,
            ),
          ),
    ),
  );

/** Build a workspace package and pack it into `destination`. */
const pack = (spawner: Spawner, workspace: string, destination: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cwd = path.join(repoRoot, workspace);
    yield* expectSuccess(spawner, cwd, ["bun", "run", "build"]);
    const { stdout } = yield* expectSuccess(spawner, cwd, [
      "npm",
      "pack",
      "--json",
      "--pack-destination",
      destination,
    ]);
    const [packed] = yield* Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Array(Schema.Struct({ filename: Schema.String })),
      ),
    )(stdout).pipe(Effect.orDie);
    assert.isDefined(packed);
    return path.join(destination, packed.filename);
  });

/** Serve the author catalog on a free loopback port for this scope. */
const serveAuthorCatalog = Effect.gen(function* () {
  const json = yield* exportAuthorCatalog.pipe(Effect.orDie);
  yield* HttpServer.serveEffect(
    Effect.succeed(
      HttpServerResponse.text(json, { contentType: "application/json" }),
    ),
  );
  return yield* HttpServer.addressFormattedWith((address) =>
    Effect.succeed(`${address}/registry/v1/author.json`),
  );
});

const LoopbackServer = NodeHttpServer.layer(createServer, {
  host: "127.0.0.1",
  port: 0,
}).pipe(Layer.orDie);

describe("registry project", () => {
  layer(Layer.mergeAll(CLI.layer, LoopbackServer, NodeServices.layer))(
    "layer",
    (it) => {
      it.effect(
        "installs, validates, builds deterministically, and previews a module",
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const spawner = yield* ChildProcessSpawner;
            const url = yield* serveAuthorCatalog;
            const tarballs = path.join(cli.workdir, "tarballs");
            yield* fs.makeDirectory(tarballs).pipe(Effect.orDie);
            const author = yield* pack(spawner, "packages/author", tarballs);
            const stackEffect = yield* pack(spawner, "apps/cli", tarballs);

            // Finalize installs the published versions, which may not exist
            // yet; the files are written before Finalize runs.
            yield* cli.run(
              "create",
              "reg",
              "--root",
              cli.workdir,
              "--catalog",
              "official",
              "--catalog",
              `author=${url}`,
              "--target",
              "catalog/",
              "--yes",
              "--no-git",
            );
            yield* cli.expectFileExists(`${registry}/catalog/starter.ts`);
            yield* cli.expectFileContaining(
              "reg/stack.effect.json",
              `"url": "${url}"`,
            );

            yield* cli.withinProject("reg", function* (project) {
              const registryDir = path.join(
                project.dir,
                "apps/catalog-registry",
              );
              const read = (file: string) =>
                fs
                  .readFileString(path.join(cli.workdir, file))
                  .pipe(Effect.orDie);
              const script = (...args: ReadonlyArray<string>) =>
                run(spawner, registryDir, ["bun", "run", ...args]);

              const manifest = path.join(registryDir, "package.json");
              yield* fs
                .writeFileString(
                  manifest,
                  (yield* read(`${registry}/package.json`))
                    .replace(/"~0\.1\.0"/, `"file:${author}"`)
                    .replace(/"~0\.16\.0"/, `"file:${stackEffect}"`),
                )
                .pipe(Effect.orDie);
              yield* project.expectInstallSucceeds();

              // The generated project's own checks pass.
              yield* project.expectTypeCheckPasses();
              yield* project.expectLintPasses();
              yield* project.expectFormatPasses();
              const validate = yield* script("validate");
              assert.strictEqual(validate.exitCode, 0, validate.stderr);
              assert.include(validate.stdout, "Catalog reg is valid");

              // Two builds, and a format run between builds, give identical bytes.
              yield* project.expectCommandSucceeds(
                "Build",
                "bun",
                "run",
                "--cwd",
                "apps/catalog-registry",
                "build",
              );
              const first = yield* read(catalogFile);
              yield* project.expectCommandSucceeds(
                "Format",
                "bun",
                "run",
                "format",
              );
              yield* script("build");
              assert.strictEqual(yield* read(catalogFile), first);

              // The standalone document carries real tokens and no official source.
              const document = yield* Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    catalogId: Schema.String,
                    requires: Schema.optional(Schema.Array(Schema.String)),
                    targets: Schema.Array(
                      Schema.Struct({ kind: Schema.String }),
                    ),
                    modules: Schema.Array(Schema.Struct({ id: Schema.String })),
                  }),
                ),
              )(first).pipe(Effect.orDie);
              assert.strictEqual(document.catalogId, "reg");
              assert.isUndefined(document.requires);
              assert.deepStrictEqual(
                document.targets.map((target) => target.kind),
                ["workspace", "app"],
              );
              assert.deepStrictEqual(
                document.modules.map((module) => module.id),
                ["app-greeting"],
              );
              assert.include(first, `"path":"{{targetPath}}/src/greeting.ts"`);

              const preview = yield* script("preview", "app/:app-greeting");
              assert.strictEqual(preview.exitCode, 0, preview.stderr);
              assert.include(preview.stdout, "apps/app-demo/src/greeting.ts");
              assert.include(
                preview.stdout,
                "Hello from a Stack Effect catalog",
              );

              // Editing a template changes the document and the preview.
              yield* project.writeFile(
                "apps/catalog-registry/templates/app-greeting/src/greeting.ts",
                'export const greeting = "Edited greeting";\n',
              );
              yield* script("build");
              assert.include(yield* read(catalogFile), "Edited greeting");
              const edited = yield* script("preview", "app/:app-greeting");
              assert.strictEqual(edited.exitCode, 0, edited.stderr);
              assert.include(edited.stdout, "Edited greeting");

              // An invalid definition fails with the source that caused it.
              const starter = `${registry}/catalog/starter.ts`;
              yield* project.writeFile(
                "apps/catalog-registry/catalog/starter.ts",
                (yield* read(starter)).replace(
                  '_tag: "kind", kind: "app"',
                  '_tag: "kind", kind: "ap"',
                ),
              );
              const invalid = yield* script("validate");
              assert.strictEqual(invalid.exitCode, 1);
              assert.include(
                invalid.stderr,
                "catalog/starter.ts: Module app-greeting references missing target ap",
              );
            });
          }),
        { timeout: 600_000 },
      );
    },
  );
});
