import { describe, expect, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { officialCatalogLayerWith } from "@repo/catalog-official/service";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import {
  type ModuleDefinition,
  ModuleId,
  type TargetDefinition,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { FinalizeReport } from "@repo/domain/Finalize";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Layer, Result, Schema, Stream } from "effect";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { type FinalizeConfig, FinalizeService } from "./FinalizeService";

const serverIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
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

const makeConfig = (config: typeof StackConfig.Type = bunConfig) => ({
  config,
  repoRoot: "/repo",
});

const emptyBlueprint = new Blueprint({ nodes: [], edges: [] });

const singleTargetBlueprint = (identity: TargetIdentity) =>
  new Blueprint({
    nodes: [{ _tag: "target", id: identity.toKey(), identity }],
    edges: [],
  });

const targetWithModule = (
  identity: TargetIdentity,
  moduleId: typeof ModuleId.Type,
) =>
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
      {
        id: `owns-module=>${identity.toPath()}=>${toAttachedModuleNodeId(identity.toKey(), moduleId)}`,
        from: identity.toKey(),
        to: toAttachedModuleNodeId(identity.toKey(), moduleId),
        reason: "owns-module" as const,
      },
    ],
  });

type TargetOverrides = Record<string, Partial<typeof TargetDefinition.Type>>;
type ModuleOverrides = Record<string, Partial<typeof ModuleDefinition.Type>>;

/** One catalog fragment with the server and client-react targets plus overrides. */
const fragmentWith = (
  targets: TargetOverrides = {},
  modules: ModuleOverrides = {},
) => ({
  targets: Object.entries({
    server: {},
    "client-react": {},
    ...targets,
  }).map(([kind, overrides]): typeof TargetDefinition.Type => ({
    kind: TargetKind.make(kind),
    title: kind,
    description: `The ${kind} target`,
    contributions: [],
    ...overrides,
  })),
  modules: Object.entries(modules).map(
    ([id, overrides]): typeof ModuleDefinition.Type => ({
      id: ModuleId.make(id),
      title: id,
      description: `The ${id} module`,
      supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
      dependencies: [],
      contributions: [],
      ...overrides,
    }),
  ),
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
const codegenTarget = (kind: string): typeof TargetDefinition.Type => ({
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
    targets?: Record<string, Partial<typeof TargetDefinition.Type>>;
    modules?: Record<string, Partial<typeof ModuleDefinition.Type>>;
    failures?: Set<string>;
  } = {},
) =>
  Layer.effect(FinalizeService)(FinalizeService.make).pipe(
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
    const serviceLayer = FinalizeService.layer.pipe(
      Layer.provide(catalogLayer),
      Layer.provide(makeSpawnerLayer([])),
    );
    return Effect.gen(function* () {
      const finalize = yield* FinalizeService;
      const steps = yield* finalize.collectNextSteps(
        targetWithModule(serverIdentity, moduleId),
        makeConfig(),
      );
      expect(steps).toContain("Read apps/server-api/extra.txt");
    }).pipe(Effect.provide(serviceLayer));
  },
);

it.effect(
  "derives nested script workdirs and next steps from target identity",
  () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "sdk/client",
    });
    const blueprint = new Blueprint({
      nodes: [
        {
          _tag: "target",
          id: identity.toKey(),
          identity,
        },
      ],
      edges: [],
    });
    const catalog = CatalogService.fromFragments(
      [
        {
          targets: [
            {
              kind: TargetKind.make("package"),
              title: "Package",
              description: "Package",
              contributions: [],
              scripts: [
                { label: "Inspect", command: "pwd", workdir: "{{targetPath}}" },
              ],
              nextSteps: ["Read {{targetDir}}/README.md"],
            },
          ],
          modules: [],
        },
      ],
      { allowFinalizeScripts: true },
    );
    const serviceLayer = FinalizeService.layer.pipe(
      Layer.provide(catalog),
      Layer.provide(makeSpawnerLayer([])),
    );
    return Effect.gen(function* () {
      const finalize = yield* FinalizeService;
      const steps = yield* finalize.collectNextSteps(blueprint, makeConfig());
      expect(steps).toContain("Read packages/sdk/client/README.md");
      const preview = yield* finalize.preview(blueprint, makeConfig());
      expect(
        preview.some((script) => script.workdir === "packages/sdk/client"),
      ).toBe(true);
    }).pipe(Effect.provide(serviceLayer));
  },
);

const runToReport = (
  svc: typeof FinalizeService.Service,
  blueprint: typeof Blueprint.Type,
  config: FinalizeConfig,
) =>
  Effect.gen(function* () {
    const executables = yield* svc.run(blueprint, config);
    const results = yield* Effect.forEach(
      executables,
      ({ execute }) =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* execute();
            yield* execution.output.pipe(Stream.runDrain);
            return yield* execution.result;
          }),
        ),
      { concurrency: 1 },
    );
    return new FinalizeReport({ results });
  });

describe("FinalizeService", () => {
  describe("preview", () => {
    it.effect(
      "should return only config-derived scripts when the blueprint has no Finalize scripts",
      () => {
        const executed: string[] = [];
        return Effect.gen(function* () {
          const svc = yield* FinalizeService;

          const scripts = yield* svc.preview(
            emptyBlueprint,
            makeConfig(bunConfig),
          );

          expect(scripts.map((s) => s.label)).toEqual(["Install dependencies"]);
          expect(scripts[0]?.command).toBe("bun install");
          expect(executed).toEqual([]);
        }).pipe(Effect.provide(makeFinalizeLayer(executed)));
      },
    );

    it.effect(
      "should include lint and format scripts when lint and format tools are configured",
      () =>
        Effect.gen(function* () {
          const svc = yield* FinalizeService;
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "bun" },
            lint: "biome",
            format: "biome",
          });

          const scripts = yield* svc.preview(
            emptyBlueprint,
            makeConfig(config),
          );

          expect(scripts.map((s) => s.label)).toEqual([
            "Install dependencies",
            "Run biome lint",
            "Run biome format",
          ]);
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "should install with pnpm when the runtime is Node with pnpm",
      () =>
        Effect.gen(function* () {
          const svc = yield* FinalizeService;

          const scripts = yield* svc.preview(
            emptyBlueprint,
            makeConfig(nodeConfig),
          );

          expect(scripts[0]?.command).toBe("pnpm install");
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "should run the prepare task after installing dependencies when the runtime is Deno",
      () =>
        Effect.gen(function* () {
          const svc = yield* FinalizeService;
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "deno" },
          });
          const scripts = yield* svc.preview(
            emptyBlueprint,
            makeConfig(config),
          );

          expect(scripts.map((script) => script.command)).toEqual([
            "deno install",
            "deno task --if-present prepare",
          ]);
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "should list target Finalize scripts before config-derived scripts when a target declares scripts",
      () =>
        Effect.gen(function* () {
          const svc = yield* FinalizeService;
          const blueprint = singleTargetBlueprint(serverIdentity);

          const scripts = yield* svc.preview(blueprint, makeConfig());

          expect(scripts.map((s) => s.label)).toEqual([
            "Generate prisma client",
            "Install dependencies",
          ]);
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
          const svc = yield* FinalizeService;
          const moduleId = ModuleId.make("shadcn-init");
          const blueprint = targetWithModule(clientIdentity, moduleId);

          const scripts = yield* svc.preview(blueprint, makeConfig());

          expect(scripts.map((s) => s.label)).toEqual([
            "Initialize shadcn",
            "Install dependencies",
          ]);
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
          const svc = yield* FinalizeService;
          const blueprint = singleTargetBlueprint(serverIdentity);

          const scripts = yield* svc.preview(blueprint, makeConfig());

          expect(scripts[0]?.command).toBe(
            "bun run build --cwd apps/server-api",
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
          const svc = yield* FinalizeService;
          const blueprint = new Blueprint({
            nodes: [serverIdentity, clientIdentity].map((identity) => ({
              _tag: "target" as const,
              id: identity.toKey(),
              identity,
            })),
            edges: [],
          });

          const scripts = yield* svc.preview(blueprint, makeConfig());

          expect(
            scripts
              .filter((script) => script.phase === "finalize")
              .map(({ command, workdir, source }) => ({
                command,
                workdir,
                source,
              })),
          ).toEqual([
            { command: "bun run codegen", workdir: ".", source: "acme" },
            { command: "bun run codegen", workdir: ".", source: "beta" },
          ]);
        }).pipe(
          Effect.provide(
            FinalizeService.layer.pipe(
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

  describe("run", () => {
    it.effect(
      "should execute scripts and report success when every command exits cleanly",
      () => {
        const executed: string[] = [];
        return Effect.gen(function* () {
          const svc = yield* FinalizeService;

          const report = yield* runToReport(svc, emptyBlueprint, makeConfig());

          expect(report.succeeded).toBe(1);
          expect(report.failed).toBe(0);
          expect(report.results[0]?._tag).toBe("Success");
          expect(executed.length).toBeGreaterThan(0);
        }).pipe(Effect.provide(makeFinalizeLayer(executed)));
      },
    );

    it.effect(
      "should keep executing and report the failure when one script fails",
      () =>
        Effect.gen(function* () {
          const svc = yield* FinalizeService;
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
          expect(report.results).toHaveLength(2);
          expect(report.results[0]?._tag).toBe("Failure");
          expect(report.results[1]?._tag).toBe("Success");
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
          const svc = yield* FinalizeService;
          const moduleId = ModuleId.make("shadcn-init");
          const blueprint = targetWithModule(clientIdentity, moduleId);

          const report = yield* runToReport(svc, blueprint, makeConfig());

          const labels = report.results.map((r) =>
            Result.isSuccess(r) ? r.success.label : r.failure.label,
          );
          expect(labels).toEqual(["Init shadcn", "Install dependencies"]);
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
          const svc = yield* FinalizeService;
          const moduleId = ModuleId.make("http-api");
          const blueprint = targetWithModule(serverIdentity, moduleId);

          const report = yield* runToReport(svc, blueprint, makeConfig());

          const labels = report.results.map((r) =>
            Result.isSuccess(r) ? r.success.label : r.failure.label,
          );
          expect(labels).toEqual([
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
          const svc = yield* FinalizeService;
          const moduleId = ModuleId.make("workspace-devenv-git");
          const blueprint = targetWithModule(serverIdentity, moduleId);

          const report = yield* runToReport(svc, blueprint, makeConfig());

          const labels = report.results.map((r) =>
            Result.isSuccess(r) ? r.success.label : r.failure.label,
          );
          expect(labels).toEqual(["Install dependencies", "Git init"]);
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
          const svc = yield* FinalizeService;
          const moduleId = ModuleId.make("workspace-devenv-git");
          const blueprint = targetWithModule(serverIdentity, moduleId);
          const config = new StackConfig({
            name: Schema.NonEmptyString.make("test"),
            runtime: { _tag: "bun" },
            lint: "biome",
          });

          const scripts = yield* svc.preview(blueprint, makeConfig(config));

          expect(scripts.map((s) => s.label)).toEqual([
            "Install dependencies",
            "Run biome lint",
            "Git init",
          ]);
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
