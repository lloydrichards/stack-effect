import { pathToFileURL } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { officialCatalogLayerWith } from "@repo/catalog-official/service";
import { Apply } from "@repo/domain/Apply";
import {
  type Contribution,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { ApplyWorkspaceService, BlueprintService } from "@repo/scaffold";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const modes = [
  { label: "Bun", runtime: { _tag: "bun" } },
  { label: "npm", runtime: { _tag: "node", packageManager: "npm" } },
  {
    label: "pnpm and Turbo",
    runtime: { _tag: "node", packageManager: "pnpm" },
    monorepo: "turbo",
  },
  { label: "Bun and Nx", runtime: { _tag: "bun" }, monorepo: "nx" },
  { label: "Bun and Vite+", runtime: { _tag: "bun" }, monorepo: "vite-plus" },
  { label: "Deno", runtime: { _tag: "deno" } },
] as const;
const identity = (kind: string, name: string) =>
  new TargetIdentity({ kind: TargetKind.make(kind), name });
const file = (path: string, contents: string): typeof Contribution.Type => ({
  _tag: "file",
  path,
  contents,
});
const entry = (
  field: "exports" | "dependencies" | "scripts",
  name: string,
  value: string,
): typeof Contribution.Type => ({
  _tag: "pkg-json-entry",
  path: "{{targetPath}}/package.json",
  field,
  name,
  value,
});

for (const mode of modes) {
  for (const layout of ["flat", "nested"] as const) {
    const app = identity("server", layout === "flat" ? "api" : "sdk/api");
    const client = identity(
      "package",
      layout === "flat" ? "sdk-client" : "sdk/client",
    );
    const codecs = identity(
      "package",
      layout === "flat" ? "sdk-codecs" : "sdk/codecs",
    );
    const command =
      mode.runtime._tag === "deno"
        ? "deno run --allow-read --allow-write src/build.ts"
        : mode.runtime._tag === "bun"
          ? "bun src/build.ts"
          : "node src/build.ts";
    const modules: ReadonlyArray<typeof ModuleDefinition.Type> = [
      {
        id: ModuleId.make("codec-probe"),
        title: "Codec probe",
        description: "Workspace peer",
        supportedRuntimes: ["bun", "node", "deno"],
        supportedOn: [{ _tag: "identity", identity: codecs }],
        dependencies: [],
        contributions: [
          entry("exports", ".", "./src/peer.ts"),
          file(
            "{{targetPath}}/src/peer.ts",
            'export const value = "codec";\nexport const codecUrl = import.meta.url;\n',
          ),
        ],
      },
      {
        id: ModuleId.make("client-probe"),
        title: "Client probe",
        description: "Workspace peer",
        supportedRuntimes: ["bun", "node", "deno"],
        supportedOn: [{ _tag: "identity", identity: client }],
        dependencies: [
          {
            _tag: "required-module",
            target: codecs,
            moduleId: ModuleId.make("codec-probe"),
          },
        ],
        contributions: [
          entry("exports", ".", "./src/peer.ts"),
          entry("dependencies", "@repo/sdk-codecs", "{{workspaceDependency}}"),
          file(
            "{{targetPath}}/src/peer.ts",
            'import { value, codecUrl } from "@repo/sdk-codecs";\nexport { codecUrl };\nexport const clientUrl = import.meta.url;\nexport const result = `client:${value}`;\n',
          ),
        ],
      },
      {
        id: ModuleId.make("app-build-probe"),
        title: "App build probe",
        description: "Build through real workspace peers",
        supportedRuntimes: ["bun", "node", "deno"],
        supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
        dependencies: [
          {
            _tag: "required-module",
            target: client,
            moduleId: ModuleId.make("client-probe"),
          },
        ],
        contributions: [
          entry("scripts", "probe", command),
          entry("dependencies", "@repo/sdk-client", "{{workspaceDependency}}"),
          file(
            "{{targetPath}}/src/build.ts",
            'import { mkdirSync, writeFileSync } from "node:fs";\nimport { result, clientUrl, codecUrl } from "@repo/sdk-client";\nmkdirSync("dist", { recursive: true });\nwriteFileSync("dist/probe.txt", result);\nwriteFileSync("dist/urls.json", JSON.stringify({ clientUrl, codecUrl }));\n',
          ),
        ],
      },
    ];
    const config = new StackConfig({
      name: "hierarchy-control",
      runtime: mode.runtime,
      ...("monorepo" in mode ? { monorepo: mode.monorepo } : {}),
    });
    const services = Layer.mergeAll(
      BlueprintService.layer,
      ApplyWorkspaceService.layer,
    ).pipe(
      Layer.provideMerge(officialCatalogLayerWith([{ targets: [], modules }])),
      Layer.provideMerge(NodeServices.layer),
    );
    it.live(
      `should build and resolve workspace peers when ${mode.label} uses a ${layout} layout`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const resolver = yield* BlueprintService;
          const workspaces = yield* ApplyWorkspaceService;
          const blueprint = yield* resolver.resolve(
            {
              targets: [
                {
                  identity: identity("workspace", config.name),
                  modules:
                    "monorepo" in mode
                      ? [
                          {
                            id: ModuleId.make(
                              `workspace-monorepo-${mode.monorepo}`,
                            ),
                          },
                        ]
                      : [],
                },
                {
                  identity: app,
                  modules: [{ id: ModuleId.make("app-build-probe") }],
                },
              ],
            },
            config,
          );
          const workspace = yield* workspaces.create();
          const plan = yield* workspace.plan({ blueprint, config });
          const materialized = yield* workspace.materialize(
            new Apply({ plan, decisions: [] }),
          );
          const temporary = yield* fs.makeTempDirectoryScoped({
            prefix: "hierarchical-workspace-",
          });
          const root = yield* fs.realPath(temporary);
          yield* Effect.forEach(materialized.files, (item) =>
            Effect.gen(function* () {
              const destination = path.join(root, item.path);
              yield* fs.makeDirectory(path.dirname(destination), {
                recursive: true,
              });
              yield* fs.writeFileString(destination, item.contents);
            }),
          );
          const run = (binary: string, args: ReadonlyArray<string>) =>
            Effect.scoped(
              Effect.gen(function* () {
                const child = yield* spawner.spawn(
                  ChildProcess.make(binary, args, {
                    cwd: root,
                    shell: false,
                    stdin: "ignore",
                    env: {
                      NX_DAEMON: "false",
                      CI: "true",
                      pnpm_config_manage_package_manager_versions: "false",
                    },
                    extendEnv: true,
                  }),
                );
                const result = yield* Effect.all(
                  {
                    stdout: Stream.mkString(Stream.decodeText(child.stdout)),
                    stderr: Stream.mkString(Stream.decodeText(child.stderr)),
                    exitCode: child.exitCode,
                  },
                  { concurrency: "unbounded" },
                );
                assert.strictEqual(
                  result.exitCode,
                  0,
                  `${binary} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
                );
                return result;
              }),
            ).pipe(Effect.timeout("90 seconds"));
          const internalManifest = path.join(
            root,
            app.toPath(),
            "templates/workspace/package.json",
          );
          yield* fs.makeDirectory(path.dirname(internalManifest), {
            recursive: true,
          });
          yield* fs.writeFileString(internalManifest, '{"private":true}');
          const manager = config.packageManagerName;
          yield* run(
            manager,
            manager === "pnpm"
              ? ["install", "--no-frozen-lockfile"]
              : ["install"],
          );
          const script = (name: string) => {
            if (manager === "deno")
              return run("deno", [
                "task",
                "--filter",
                app.toPackageName(),
                name,
              ]);
            if (manager === "npm")
              return run("npm", [
                "run",
                name,
                "--workspace",
                app.toPackageName(),
              ]);
            if (manager === "pnpm")
              return run("pnpm", [
                "--filter",
                app.toPackageName(),
                "run",
                name,
              ]);
            return run("bun", ["run", "--filter", app.toPackageName(), name]);
          };
          if ("monorepo" in mode) yield* run(manager, ["run", "build"]);
          else yield* script("build");
          const artifact =
            manager === "deno" ? app.toPackageName() : "index.js";
          assert.isTrue(
            yield* fs.exists(path.join(root, app.toPath(), "dist", artifact)),
          );
          if ("monorepo" in mode && mode.monorepo === "vite-plus") {
            const buildArtifact = path.join(
              root,
              app.toPath(),
              "dist",
              artifact,
            );
            yield* fs.remove(buildArtifact);
            yield* run("bun", [
              "run",
              "vp",
              "run",
              "--no-cache",
              "--filter",
              "./apps/**",
              "--filter",
              "./packages/**",
              "--fail-if-no-match",
              "build",
            ]);
            assert.isTrue(yield* fs.exists(buildArtifact));
          }
          yield* script("probe");
          assert.strictEqual(
            yield* fs.readFileString(
              path.join(root, app.toPath(), "dist/probe.txt"),
            ),
            "client:codec",
          );
          if (manager === "deno") {
            assert.deepStrictEqual(
              yield* Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    clientUrl: Schema.String,
                    codecUrl: Schema.String,
                  }),
                ),
              )(
                yield* fs.readFileString(
                  path.join(root, app.toPath(), "dist/urls.json"),
                ),
              ),
              {
                clientUrl: pathToFileURL(
                  path.join(root, client.toPath(), "src/peer.ts"),
                ).href,
                codecUrl: pathToFileURL(
                  path.join(root, codecs.toPath(), "src/peer.ts"),
                ).href,
              },
            );
          }
          assert.isTrue(
            yield* fs.exists(path.join(root, client.toPath(), "package.json")),
          );
          assert.isTrue(
            yield* fs.exists(path.join(root, codecs.toPath(), "package.json")),
          );
        }).pipe(Effect.scoped, Effect.provide(services)),
    );
  }
}
