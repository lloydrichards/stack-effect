import { describe, expect, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
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
import { Effect, Layer, Result, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { type FinalizeConfig, FinalizeService } from "./FinalizeService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const serverIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});

const clientIdentity = new TargetIdentity({
  kind: TargetKind.make("client-react"),
  name: "web",
});

const bunConfig = new StackConfig({
  name: "test-project" as typeof import("effect").Schema.NonEmptyString.Type,
  runtime: { _tag: "bun" },
});

const nodeConfig = new StackConfig({
  name: "test-project" as typeof import("effect").Schema.NonEmptyString.Type,
  runtime: { _tag: "node", packageManager: "pnpm" },
});

const makeConfig = (
  config: typeof StackConfig.Type = bunConfig,
): FinalizeConfig => ({
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

// Stub catalog that returns definitions with configurable scripts
const makeCatalogLayer = (
  targets: Record<string, Partial<typeof TargetDefinition.Type>> = {},
  modules: Record<string, Partial<typeof ModuleDefinition.Type>> = {},
) =>
  Layer.succeed(CatalogService, {
    getTarget: Effect.fn("MockCatalog.getTarget")(function* (
      kind: typeof TargetKind.Type,
    ) {
      const base = {
        kind: TargetKind.make(kind),
        title: kind,
        description: "",
        contributions: {
          files: [],
          dependencies: [],
          scripts: [],
          barrelExports: [],
          tsconfigs: [],
        },
        scripts: [],
      };
      return { ...base, ...targets[kind] } as typeof TargetDefinition.Type;
    }),
    getModule: Effect.fn("MockCatalog.getModule")(function* (
      moduleId: typeof ModuleId.Type,
    ) {
      const base = {
        id: moduleId,
        title: moduleId,
        description: "",
        supportedOn: [],
        dependencies: [],
        implies: [],
        contributions: {
          files: [],
          dependencies: [],
          scripts: [],
          barrelExports: [],
          tsconfigs: [],
        },
        scripts: [],
      };
      return { ...base, ...modules[moduleId] } as typeof ModuleDefinition.Type;
    }),
  } as never);

// Stub spawner that records commands and can simulate failures
const makeSpawnerLayer = (
  executed: string[],
  failures: Set<string> = new Set(),
) =>
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
    Layer.provide(makeCatalogLayer(opts.targets, opts.modules)),
    Layer.provide(makeSpawnerLayer(executed, opts.failures)),
  );

/** Helper: drives all script executions and builds a FinalizeReport */
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FinalizeService", () => {
  describe("preview", () => {
    it.effect(
      "returns only config-derived scripts when blueprint has no finalize scripts",
      () =>
        Effect.gen(function* () {
          const executed: string[] = [];
          const svc = yield* FinalizeService;

          const scripts = yield* svc.preview(
            emptyBlueprint,
            makeConfig(bunConfig),
          );

          expect(scripts.map((s) => s.label)).toEqual(["Install dependencies"]);
          expect(scripts[0]?.command).toBe("bun install");
          expect(executed).toEqual([]);
        }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect("includes lint and format scripts when configured", () =>
      Effect.gen(function* () {
        const svc = yield* FinalizeService;
        const config = new StackConfig({
          name: "test" as typeof import("effect").Schema.NonEmptyString.Type,
          runtime: { _tag: "bun" },
          lint: "biome",
          format: "biome",
        });

        const scripts = yield* svc.preview(emptyBlueprint, makeConfig(config));

        expect(scripts.map((s) => s.label)).toEqual([
          "Install dependencies",
          "Run biome lint",
          "Run biome format",
        ]);
      }).pipe(Effect.provide(makeFinalizeLayer([]))),
    );

    it.effect(
      "uses pnpm as package manager when runtime is node with pnpm",
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
      "collects finalize scripts from target definitions before config-derived scripts",
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

    it.effect("collects finalize scripts from module definitions", () =>
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

    it.effect("resolves token placeholders in script commands", () =>
      Effect.gen(function* () {
        const svc = yield* FinalizeService;
        const blueprint = singleTargetBlueprint(serverIdentity);

        const scripts = yield* svc.preview(blueprint, makeConfig());

        expect(scripts[0]?.command).toBe("bun run build --cwd apps/server-api");
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
  });

  describe("run", () => {
    it.effect(
      "executes scripts sequentially and returns a success report",
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

    it.effect("continues executing after a script failure and reports it", () =>
      Effect.gen(function* () {
        const executed: string[] = [];
        const svc = yield* FinalizeService;
        const config = new StackConfig({
          name: "test" as typeof import("effect").Schema.NonEmptyString.Type,
          runtime: { _tag: "bun" },
          lint: "biome",
        });

        const report = yield* runToReport(
          svc,
          emptyBlueprint,
          makeConfig(config),
        );

        // Both install and lint should execute even if install fails
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
      "runs module finalize scripts before config-derived scripts",
      () =>
        Effect.gen(function* () {
          const executed: string[] = [];
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
      "runs target finalize scripts before module finalize scripts",
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

    it.effect("runs post-finalize scripts after config-derived scripts", () =>
      Effect.gen(function* () {
        const svc = yield* FinalizeService;
        const moduleId = ModuleId.make("git-init");
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
              "git-init": {
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
      "orders finalize scripts, then config-derived, then post-finalize",
      () =>
        Effect.gen(function* () {
          const svc = yield* FinalizeService;
          const moduleId = ModuleId.make("git-init");
          const blueprint = targetWithModule(serverIdentity, moduleId);
          const config = new StackConfig({
            name: "test" as typeof import("effect").Schema.NonEmptyString.Type,
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
                "git-init": {
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
