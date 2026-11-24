import { assert, describe, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { officialCatalogLayerWith } from "@repo/catalog-official/service";
import {
  Blueprint,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  type ModuleDefinition,
  ModuleId,
  type TargetDefinition,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { FinalizeReport } from "@repo/domain/Finalize";
import { StackConfig } from "@repo/domain/StackConfig";
import { type FinalizeConfig, Finalizer } from "@repo/scaffold/Finalize";
import { Effect, Layer, Result, Schema, Stream } from "effect";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const serverIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "sdk/api",
});

const clientIdentity = new TargetIdentity({
  kind: TargetKind.make("client-react"),
  name: "web",
});

const bunConfig = new StackConfig({
  name: Schema.NonEmptyString.make("test-project"),
  runtime: { _tag: "bun" },
});

const nodeConfig = new StackConfig({
  name: Schema.NonEmptyString.make("test-project"),
  runtime: { _tag: "node", packageManager: "pnpm" },
});

const makeConfig = (config: StackConfig = bunConfig) => ({
  config,
  repositoryRoot: "/repo",
});

const emptyBlueprint = new Blueprint({ nodes: [], edges: [] });

const singleTargetBlueprint = (identity: TargetIdentity) =>
  new Blueprint({
    nodes: [{ _tag: "target", id: identity.toKey(), identity }],
    edges: [],
  });

const targetWithModule = (identity: TargetIdentity, moduleId: ModuleId) =>
  new Blueprint({
    nodes: [
      { _tag: "target", id: identity.toKey(), identity },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(identity.toKey(), moduleId),
        targetId: identity.toKey(),
        moduleId,
      },
    ],
    edges: [
      makeBlueprintEdge(
        "owns-module",
        identity.toKey(),
        toAttachedModuleNodeId(identity.toKey(), moduleId),
      ),
    ],
  });

type TargetOverrides = Record<string, Partial<TargetDefinition>>;
type ModuleOverrides = Record<string, Partial<ModuleDefinition>>;

/** One catalog fragment with the server and client-react targets plus overrides. */
const fragmentWith = (
  targets: TargetOverrides = {},
  modules: ModuleOverrides = {},
) => ({
  targets: Object.entries({
    server: {},
    "client-react": {},
    ...targets,
  }).map(([kind, overrides]): TargetDefinition => ({
    kind: TargetKind.make(kind),
    title: kind,
    description: `The ${kind} target`,
    contributions: [],
    ...overrides,
  })),
  modules: Object.entries(modules).map(([id, overrides]): ModuleDefinition => ({
    id: ModuleId.make(id),
    title: id,
    description: `The ${id} module`,
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
    dependencies: [],
    contributions: [],
    ...overrides,
  })),
});

/** A real, composed catalog whose fragment may declare Finalize scripts. */
const catalogLayerWith = (
  targets: TargetOverrides = {},
  modules: ModuleOverrides = {},
) =>
  CatalogService.fromFragments([fragmentWith(targets, modules)], {
    allowFinalizeScripts: true,
  });

/** A target whose only Finalize script runs `bun run codegen` at the repository root. */
const codegenTarget = (kind: string): TargetDefinition => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [],
  scripts: [{ label: "Codegen", command: "bun run codegen", workdir: "." }],
});

const makeSpawnerLayer = (
  executed: string[],
  failures: Set<string> = new Set(),
) =>
  // NOTE: The fake spawner records the exact shell command and can fail selected commands.
  Layer.succeed(ChildProcessSpawner, {
    spawn: (command: { command: string; args: ReadonlyArray<string> }) => {
      const cmd = [command.command, ...command.args].join(" ");
      executed.push(cmd);
      const failed = failures.has(cmd);
      return Effect.succeed({
        stdout: Stream.empty,
        stderr: Stream.empty,
        exitCode: failed ? Effect.succeed(1) : Effect.succeed(0),
        pid: Effect.succeed(1234),
        kill: () => Effect.void,
        unref: Effect.void,
      });
    },
    exitCode: (command: { command: string; args: ReadonlyArray<string> }) => {
      const cmd = [command.command, ...command.args].join(" ");
      executed.push(cmd);
      if (failures.has(cmd)) {
        return Effect.fail("Command failed: " + cmd);
      }
      return Effect.succeed(0);
    },
  } as never);

const makeFinalizeLayer = (
  executed: string[],
  opts: {
    targets?: Record<string, Partial<TargetDefinition>>;
    modules?: Record<string, Partial<ModuleDefinition>>;
    failures?: Set<string>;
  } = {},
) =>
  Finalizer.layer.pipe(
    Layer.provide(catalogLayerWith(opts.targets, opts.modules)),
    Layer.provide(makeSpawnerLayer(executed, opts.failures)),
  );

it.effect(
  "should resolve next-step tokens when a module injected into the official catalog declares next steps",
  () => {
    const moduleId = ModuleId.make("server-extra-example");
    const catalogLayer = officialCatalogLayerWith([
      {
        targets: [],
        modules: [
          {
            id: moduleId,
            title: "Extra example",
            description: "Contributed guidance",
            supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
            dependencies: [],
            contributions: [],
            nextSteps: ["Read {{targetPath}}/extra.txt"],
          },
        ],
      },
    ]);
    const serviceLayer = Finalizer.layer.pipe(
      Layer.provide(catalogLayer),
      Layer.provide(makeSpawnerLayer([])),
    );
    return Effect.gen(function* () {
      const finalize = yield* Finalizer;
      const steps = yield* finalize.collectNextSteps(
        targetWithModule(serverIdentity, moduleId),
        makeConfig(),
      );
      assert.include(steps, "Read apps/sdk/server-api/extra.txt");
    }).pipe(Effect.provide(serviceLayer));
  },
);

const runToReport = (
  svc: typeof Finalizer.Service,
  blueprint: Blueprint,
  config: FinalizeConfig,
) =>
  Effect.gen(function* () {
    const scripts = yield* svc.scripts(blueprint, config);
    const results = yield* Effect.forEach(
      scripts,
      (script) =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* svc.executeScoped(
              script,
              config.repositoryRoot,
            );
            yield* execution.output.pipe(Stream.runDrain);
            return yield* execution.result;
          }),
        ),
      { concurrency: 1 },
    );
    return new FinalizeReport({ results });
  });

describe("Finalizer", () => {
  describe("scripts", () => {
    it.effect(
      "should return only config-derived scripts when the blueprint has no Finalize scripts",
      () => {
        const executed: string[] = [];
        return Effect.gen(function* () {
          const svc = yield* Finalizer;

          const scripts = yield* svc.scripts(
            emptyBlueprint,
            makeConfig(bunConfig),
          );

          assert.deepStrictEqual(
            scripts.map((s) => s.label),
            ["Install dependencies"],
          );
          assert.strictEqual(scripts[0]?.command, "bun install");
          assert.deepStrictEqual(executed, []);
        }).pipe(Effect.provide(makeFinalizeLayer(executed)));
      },
    );

    it.effect(
      "should include lint and format scripts when lint and format tools are configured",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "bun" },
            lint: "biome",
            format: "biome",
          });

          const scripts = yield* svc.scripts(
            emptyBlueprint,
            makeConfig(config),
          );

          assert.deepStrictEqual(
            scripts.map((s) => s.label),
            ["Install dependencies", "Run biome lint", "Run biome format"],
          );
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "should install with pnpm when the runtime is Node with pnpm",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;

          const scripts = yield* svc.scripts(
            emptyBlueprint,
            makeConfig(nodeConfig),
          );

          assert.strictEqual(scripts[0]?.command, "pnpm install");
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "should run the prepare task after installing dependencies when the runtime is Deno",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "deno" },
          });
          const scripts = yield* svc.scripts(
            emptyBlueprint,
            makeConfig(config),
          );

          assert.deepStrictEqual(
            scripts.map((script) => script.command),
            ["deno install", "deno task --if-present prepare"],
          );
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "should list target Finalize scripts before config-derived scripts when a target declares scripts",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const blueprint = singleTargetBlueprint(serverIdentity);

          const scripts = yield* svc.scripts(blueprint, makeConfig());

          assert.deepStrictEqual(
            scripts.map((s) => s.label),
            ["Generate prisma client", "Install dependencies"],
          );
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              targets: {
                server: {
                  scripts: [
                    {
                      label: "Generate prisma client",
                      command: "bun prisma generate",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );

    it.effect(
      "should list module Finalize scripts before config-derived scripts when a module declares scripts",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const moduleId = ModuleId.make("shadcn-init");
          const blueprint = targetWithModule(clientIdentity, moduleId);

          const scripts = yield* svc.scripts(blueprint, makeConfig());

          assert.deepStrictEqual(
            scripts.map((s) => s.label),
            ["Initialize shadcn", "Install dependencies"],
          );
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              modules: {
                "shadcn-init": {
                  scripts: [
                    {
                      label: "Initialize shadcn",
                      command: "bunx shadcn init",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );

    it.effect(
      "should resolve token placeholders when a script command contains them",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const blueprint = singleTargetBlueprint(serverIdentity);

          const scripts = yield* svc.scripts(blueprint, makeConfig());

          assert.strictEqual(
            scripts[0]?.command,
            "bun run build --cwd apps/sdk/server-api",
          );
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              targets: {
                server: {
                  scripts: [
                    {
                      label: "Build",
                      command:
                        "{{packageManager}} run build --cwd {{targetPath}}",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );

    it.effect(
      "should keep both scripts when different sources declare the same command and workdir",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const blueprint = new Blueprint({
            nodes: [serverIdentity, clientIdentity].map((identity) => ({
              _tag: "target" as const,
              id: identity.toKey(),
              identity,
            })),
            edges: [],
          });

          const scripts = yield* svc.scripts(blueprint, makeConfig());

          assert.deepStrictEqual(
            scripts
              .filter((script) => script.phase === "finalize")
              .map(({ command, workdir, source }) => ({
                command,
                workdir,
                source,
              })),
            [
              { command: "bun run codegen", workdir: ".", source: "acme" },
              { command: "bun run codegen", workdir: ".", source: "beta" },
            ],
          );
        }).pipe(
          Effect.provide(
            Finalizer.layer.pipe(
              Layer.provide(
                CatalogService.fromFragments(
                  [
                    { targets: [codegenTarget("server")], modules: [] },
                    { targets: [codegenTarget("client-react")], modules: [] },
                  ],
                  {
                    allowFinalizeScripts: true,
                    sources: [
                      { name: "acme", requires: [] },
                      { name: "beta", requires: [] },
                    ],
                  },
                ),
              ),
              Layer.provide(makeSpawnerLayer([])),
            ),
          ),
        ),
    );
  });

  describe("executeScoped", () => {
    it.effect(
      "should execute scripts and report success when every command exits cleanly",
      () => {
        const executed: string[] = [];
        return Effect.gen(function* () {
          const svc = yield* Finalizer;

          const report = yield* runToReport(svc, emptyBlueprint, makeConfig());

          assert.strictEqual(report.succeeded, 1);
          assert.strictEqual(report.failed, 0);
          assert.strictEqual(report.results[0]?._tag, "Success");
          assert.isAbove(executed.length, 0);
        }).pipe(Effect.provide(makeFinalizeLayer(executed)));
      },
    );

    it.effect(
      "should keep executing and report the failure when one script fails",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "bun" },
            lint: "biome",
          });

          const report = yield* runToReport(
            svc,
            emptyBlueprint,
            makeConfig(config),
          );

          // NOTE: Finalize reports failures after attempting every configured script.
          assert.lengthOf(report.results, 2);
          assert.strictEqual(report.results[0]?._tag, "Failure");
          assert.strictEqual(report.results[1]?._tag, "Success");
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              failures: new Set(["bun install"]),
            }),
          ),
        ),
    );

    it.effect(
      "should run module Finalize scripts before config-derived scripts when a module declares scripts",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const moduleId = ModuleId.make("shadcn-init");
          const blueprint = targetWithModule(clientIdentity, moduleId);

          const report = yield* runToReport(svc, blueprint, makeConfig());

          const labels = report.results.map((r) =>
            Result.isSuccess(r) ? r.success.label : r.failure.label,
          );
          assert.deepStrictEqual(labels, [
            "Init shadcn",
            "Install dependencies",
          ]);
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              modules: {
                "shadcn-init": {
                  scripts: [
                    {
                      label: "Init shadcn",
                      command: "bunx shadcn init",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );

    it.effect(
      "should run target Finalize scripts before module Finalize scripts when both declare scripts",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const moduleId = ModuleId.make("http-api");
          const blueprint = targetWithModule(serverIdentity, moduleId);

          const report = yield* runToReport(svc, blueprint, makeConfig());

          const labels = report.results.map((r) =>
            Result.isSuccess(r) ? r.success.label : r.failure.label,
          );
          assert.deepStrictEqual(labels, [
            "Target setup",
            "Module setup",
            "Install dependencies",
          ]);
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              targets: {
                server: {
                  scripts: [
                    {
                      label: "Target setup",
                      command: "echo target",
                    },
                  ],
                },
              },
              modules: {
                "http-api": {
                  scripts: [
                    {
                      label: "Module setup",
                      command: "echo module",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );

    it.effect(
      "should run post-finalize scripts after config-derived scripts when a module declares a post-finalize phase",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const moduleId = ModuleId.make("workspace-devenv-git");
          const blueprint = targetWithModule(serverIdentity, moduleId);

          const report = yield* runToReport(svc, blueprint, makeConfig());

          const labels = report.results.map((r) =>
            Result.isSuccess(r) ? r.success.label : r.failure.label,
          );
          assert.deepStrictEqual(labels, ["Install dependencies", "Git init"]);
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              modules: {
                "workspace-devenv-git": {
                  scripts: [
                    {
                      label: "Git init",
                      command: "git init",
                      phase: "post-finalize",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );

    it.effect(
      "should order Finalize, config-derived, then post-finalize scripts when all phases are present",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const moduleId = ModuleId.make("workspace-devenv-git");
          const blueprint = targetWithModule(serverIdentity, moduleId);
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "bun" },
            lint: "biome",
          });

          const scripts = yield* svc.scripts(blueprint, makeConfig(config));

          assert.deepStrictEqual(
            scripts.map((s) => s.label),
            ["Install dependencies", "Run biome lint", "Git init"],
          );
        }).pipe(
          Effect.provide(
            makeFinalizeLayer([], {
              modules: {
                "workspace-devenv-git": {
                  scripts: [
                    {
                      label: "Git init",
                      command: "git init",
                      phase: "post-finalize",
                    },
                  ],
                },
              },
            }),
          ),
        ),
    );
  });
});
