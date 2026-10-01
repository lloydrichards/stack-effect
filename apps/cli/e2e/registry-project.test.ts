// @effect-diagnostics nodeBuiltinImport:off
// oxlint-disable-next-line effecttsgo/node-builtin-import -- NodeHttpServer.layer requires the Node server factory.
import { createServer } from "node:http";
import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { exportAuthorCatalog } from "@repo/catalog-author/service";
import { CatalogDocument } from "@repo/domain/Catalog";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { HttpServer, HttpServerResponse } from "effect/http";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { CLI, type CommandResult, spawnCommand } from "./harness";

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

const expectExit =
  (label: string, code = 0) =>
  (result: CommandResult) =>
    result.exitCode === code
      ? Effect.succeed(result)
      : Effect.die(
          new Error(
            `${label}: expected exit ${code}, got ${result.exitCode}\n${result.stdout.slice(-2000)}\n${result.stderr.slice(-2000)}`,
          ),
        );

const PackResult = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ filename: Schema.String })),
);

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

            /** Build a workspace package and pack it outside the checkout. */
            const pack = (workspace: string) =>
              Effect.gen(function* () {
                const cwd = path.join(repoRoot, workspace);
                const exec = (...args: ReadonlyArray<string>) =>
                  spawnCommand(spawner, args, cwd, tarballs).pipe(
                    Effect.flatMap(
                      expectExit(`${workspace}: ${args.join(" ")}`),
                    ),
                  );
                yield* exec("bun", "run", "build");
                const { stdout } = yield* exec(
                  "npm",
                  "pack",
                  "--json",
                  "--pack-destination",
                  tarballs,
                );
                const [packed] = yield* Schema.decodeEffect(PackResult)(
                  stdout,
                ).pipe(Effect.orDie);
                assert.isDefined(packed);
                return path.join(tarballs, packed.filename);
              });
            const author = yield* pack("packages/author");
            const stackEffect = yield* pack("apps/cli");

            const created = yield* cli.run(
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
            // Until the pinned versions are published, Finalize's install is
            // the only step allowed to fail; Apply has written every file.
            // Install the packed packages below before running the generated scripts.
            if (created.exitCode !== 0)
              assert.match(
                created.stdout + created.stderr,
                /@stack-effect\/author@~0\.2\.0 failed to resolve/,
              );
            yield* cli.expectFileExists(`${registry}/catalog/starter.ts`);
            yield* cli.expectFileContaining(
              "reg/stack.effect.json",
              `"url": "${url}"`,
            );

            yield* cli.withinProject("reg", function* (project) {
              const read = (file: string) =>
                fs
                  .readFileString(path.join(cli.workdir, file))
                  .pipe(Effect.orDie);
              const script = (code: number, ...args: ReadonlyArray<string>) =>
                project
                  .exec("bun", "run", "--cwd", "apps/catalog-registry", ...args)
                  .pipe(Effect.flatMap(expectExit(args.join(" "), code)));
              const build = Effect.andThen(
                script(0, "build"),
                read(catalogFile),
              );

              const manifest = yield* read(`${registry}/package.json`);
              const local = manifest
                .replace('"~0.2.0"', `"file:${author}"`)
                .replace('"~0.17.0"', `"file:${stackEffect}"`);
              assert.notInclude(local, '"~0.', "every pinned range replaced");
              yield* project.writeFile(
                "apps/catalog-registry/package.json",
                local,
              );
              yield* project.expectInstallSucceeds();

              // The registry project's files arrive formatted; then run the
              // same lint and format steps as Finalize and the checks.
              yield* project.expectCommandSucceeds(
                "Generated files are formatted",
                "bunx",
                "oxfmt",
                "--check",
                "apps/catalog-registry",
              );
              yield* project.expectLintPasses();
              yield* project.expectCommandSucceeds("Format", "bun", "format");
              yield* project.expectFormatPasses();
              yield* project.expectTypeCheckPasses();
              const validate = yield* script(0, "validate");
              assert.include(validate.stdout, "Catalog reg is valid");

              // Templates are embedded byte for byte, so a format run must leave
              // an author's unformatted template, and the document, unchanged.
              const greeting =
                "apps/catalog-registry/templates/app-greeting/src/greeting.ts";
              const unformatted =
                'export const greeting = "Hello from a Stack Effect catalog"\nconst  spacing = {a:1}\n';
              yield* project.writeFile(greeting, unformatted);
              const first = yield* build;
              yield* project.expectCommandSucceeds("Format", "bun", "format");
              assert.strictEqual(yield* read(`reg/${greeting}`), unformatted);
              assert.strictEqual(yield* build, first);
              assert.include(first, "const  spacing = {a:1}");

              // A v1 standalone document with real tokens and no official source.
              const document = yield* Schema.decodeEffect(
                Schema.fromJsonString(CatalogDocument),
              )(first).pipe(Effect.orDie);
              assert.strictEqual(document.formatVersion, 1);
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
              assert.include(first, '\\"name\\": \\"{{packageName}}\\"');

              const preview = yield* script(0, "preview", "app/:app-greeting");
              assert.include(preview.stdout, "apps/app-demo/src/greeting.ts");
              assert.include(preview.stdout, '"name": "app-demo"');
              assert.include(
                preview.stdout,
                "Hello from a Stack Effect catalog",
              );

              // Editing a template changes the document and the preview.
              yield* project.writeFile(
                "apps/catalog-registry/templates/app-greeting/src/greeting.ts",
                'export const greeting = "Edited greeting";\n',
              );
              assert.include(yield* build, "Edited greeting");
              const edited = yield* script(0, "preview", "app/:app-greeting");
              assert.include(edited.stdout, "Edited greeting");

              // An invalid definition fails with the source that caused it.
              yield* project.writeFile(
                "apps/catalog-registry/catalog/starter.ts",
                (yield* read(`${registry}/catalog/starter.ts`)).replace(
                  '_tag: "kind", kind: "app"',
                  '_tag: "kind", kind: "ap"',
                ),
              );
              const invalid = yield* script(1, "validate");
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
