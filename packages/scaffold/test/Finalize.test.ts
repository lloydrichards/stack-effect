import { assert, describe, it } from "@effect/vitest";
import { officialCatalogLayerWith } from "@repo/catalog-official/service";
import { CatalogReader } from "@repo/catalog/Catalog";
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
import { FinalizeScript } from "@repo/domain/Finalize";
import { StackConfig } from "@repo/domain/StackConfig";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { Finalizer, scriptKey } from "@repo/scaffold/Finalize";
import {
  Effect,
  Layer,
  Ref,
  Result,
  Schema,
  type Scope,
  Sink,
  Stream,
} from "effect";
import {
  ChildProcessSpawner,
  ExitCode,
  make as makeSpawner,
  makeHandle,
  ProcessId,
} from "effect/process/ChildProcessSpawner";

describe("Finalizer", () => {
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
    modules: Object.entries(modules).map(
      ([id, overrides]): ModuleDefinition => ({
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
    CatalogReader.fromFragments([fragmentWith(targets, modules)], {
      allowFinalizeScripts: true,
    });

  /** A target whose only Finalize script runs `bun run codegen` at the repository root. */
  const codegenTarget = (kind: string): TargetDefinition => ({
    kind: TargetKind.make(kind),
    title: kind,
    description: `The ${kind} target`,
    contributions: [],
    scripts: [
      {
        label: "Codegen",
        command: "bun run codegen",
        workdir: ".",
        phase: "finalize",
      },
    ],
  });

  const unusedSpawner = Layer.succeed(
    ChildProcessSpawner,
    makeSpawner(() => Effect.die("Expected to list scripts without spawning")),
  );

  const makeFinalizeLayer = (
    opts: {
      targets?: TargetOverrides;
      modules?: ModuleOverrides;
    } = {},
  ) =>
    Layer.mergeAll(Finalizer.layer, BlueprintResolver.layer).pipe(
      Layer.provide(catalogLayerWith(opts.targets, opts.modules)),
      Layer.provide(unusedSpawner),
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
        Layer.provide(unusedSpawner),
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

  it.effect("should keep next-step order and collapse duplicate guidance", () =>
    Effect.gen(function* () {
      const finalize = yield* Finalizer;
      const blueprint = targetWithModule(
        serverIdentity,
        ModuleId.make("server-guidance"),
      );
      const steps = yield* finalize.collectNextSteps(blueprint, makeConfig());

      assert.deepStrictEqual(steps, [
        "Configure apps/sdk/server-api",
        "Read apps/sdk/server-api/README.md",
        "Start apps/sdk/server-api",
      ]);
    }).pipe(
      Effect.provide(
        makeFinalizeLayer({
          targets: {
            server: {
              nextSteps: [
                "Configure {{targetPath}}",
                "Read {{targetPath}}/README.md",
              ],
            },
          },
          modules: {
            "server-guidance": {
              nextSteps: [
                "Start {{targetPath}}",
                "Read {{targetPath}}/README.md",
              ],
            },
          },
        }),
      ),
    ),
  );

  describe("scripts", () => {
    it.effect(
      "should return only config-derived scripts when the blueprint has no Finalize scripts",
      () => {
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
        }).pipe(Effect.provide(makeFinalizeLayer()));
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
            scripts.map(({ command, workdir, origin }) => ({
              command,
              workdir,
              origin,
            })),
            [
              { command: "bun install", workdir: ".", origin: "config" },
              { command: "bun run lint", workdir: ".", origin: "config" },
              { command: "bun run format", workdir: ".", origin: "config" },
            ],
          );
        }).pipe(Effect.provide(makeFinalizeLayer())),
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
        }).pipe(Effect.provide(makeFinalizeLayer())),
    );

    it.effect(
      "should run the prepare task after installing dependencies when the runtime is Deno",
      () =>
        Effect.gen(function* () {
          const svc = yield* Finalizer;
          const install = ["deno install", "deno task --if-present prepare"];
          for (const [tools, commands] of [
            [{}, install],
            [
              { lint: "oxlint", format: "oxfmt" },
              [...install, "deno task lint", "deno task format"],
            ],
          ] as const) {
            const config = new StackConfig({
              name: Schema.NonEmptyString.make("test"),
              runtime: { _tag: "deno" },
              ...tools,
            });
            const scripts = yield* svc.scripts(
              emptyBlueprint,
              makeConfig(config),
            );

            assert.deepStrictEqual(
              scripts.map((script) => script.command),
              commands,
            );
          }
        }).pipe(Effect.provide(makeFinalizeLayer())),
    );

    it.effect(
      "should list target, module, config, and post-finalize scripts in run order",
      () =>
        Effect.gen(function* () {
          const finalizer = yield* Finalizer;
          const resolver = yield* BlueprintResolver;
          const blueprint = yield* resolver.resolve({
            targets: [
              {
                identity: serverIdentity,
                modules: [{ id: ModuleId.make("app-setup") }],
              },
            ],
          });

          const scripts = yield* finalizer.scripts(blueprint, makeConfig());

          assert.deepStrictEqual(
            scripts.map(({ label }) => label),
            ["Build", "Module setup", "Install dependencies", "Post setup"],
          );
          assert.include(scripts[0], {
            command: "bun run build --cwd apps/sdk/server-api",
            workdir: "apps/sdk/server-api",
            origin: "target: server",
          });
          assert.include(scripts[1], {
            workdir: "apps/sdk/server-api",
            origin: "module: app-setup",
          });
        }).pipe(
          Effect.provide(
            makeFinalizeLayer({
              targets: {
                server: {
                  scripts: [
                    {
                      label: "Build",
                      command:
                        "{{packageManager}} run build --cwd {{targetPath}}",
                      phase: "finalize",
                    },
                  ],
                },
              },
              modules: {
                "app-setup": {
                  scripts: [
                    {
                      label: "Module setup",
                      command: "echo setup",
                      phase: "finalize",
                    },
                    {
                      label: "Post setup",
                      command: "echo done",
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

          const scripts = (yield* svc.scripts(blueprint, makeConfig())).filter(
            (script) => script.phase === "finalize",
          );

          assert.strictEqual(new Set(scripts.map(scriptKey)).size, 2);
          assert.deepStrictEqual(
            scripts.map(({ command, workdir, source }) => ({
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
                CatalogReader.fromFragments(
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
              Layer.provide(unusedSpawner),
            ),
          ),
        ),
    );
  });

  const checkScript = FinalizeScript.make({
    label: "Check target",
    command: "check",
    phase: "finalize",
    origin: "target: server",
    workdir: ".",
  });

  const executionLayer = (
    exitCode: Effect.Effect<ExitCode>,
    process: Effect.Effect<void, never, Scope.Scope>,
  ) =>
    Finalizer.layer.pipe(
      Layer.provide(catalogLayerWith()),
      Layer.provide(
        Layer.succeed(
          ChildProcessSpawner,
          makeSpawner((command) => {
            assert(command._tag === "StandardCommand");
            assert.strictEqual(command.options.cwd, "/repo");
            return process.pipe(
              Effect.as(
                makeHandle({
                  pid: ProcessId(1234),
                  stdin: Sink.drain,
                  stdout: Stream.empty,
                  stderr: Stream.empty,
                  all: Stream.empty,
                  exitCode,
                  isRunning: Effect.succeed(true),
                  kill: () => Effect.void,
                  getInputFd: () => Sink.drain,
                  getOutputFd: () => Stream.empty,
                  unref: Effect.succeed(Effect.void),
                }),
              ),
            );
          }),
        ),
      ),
    );

  describe("executeScoped", () => {
    it.effect(
      "should run in the target directory and return stdout and stderr",
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const finalize = yield* Finalizer;
            const execution = yield* finalize.executeScoped(
              FinalizeScript.make({
                command: "printf ready && printf warning >&2",
                label: "Check target",
                phase: "finalize",
                origin: "target: server",
                workdir: "apps/sdk/server-api",
              }),
              "/repo",
            );

            const output = yield* Stream.runCollect(execution.output);
            assert.sameMembers(Array.from(output), ["ready", "warning"]);
            const result = yield* execution.result;
            assert(Result.isSuccess(result));
            assert.deepStrictEqual(result.success, {
              label: "Check target",
              command: "printf ready && printf warning >&2",
            });
          }),
        ).pipe(
          Effect.provide(
            Finalizer.layer.pipe(
              Layer.provide(catalogLayerWith()),
              Layer.provide(
                Layer.succeed(
                  ChildProcessSpawner,
                  makeSpawner((command) => {
                    assert(command._tag === "StandardCommand");
                    assert.strictEqual(
                      command.options.cwd,
                      "/repo/apps/sdk/server-api",
                    );
                    assert.strictEqual(command.options.shell, true);
                    const encoder = new TextEncoder();
                    const stdout =
                      command.options.stdout === "pipe"
                        ? Stream.make(encoder.encode("ready\n"))
                        : Stream.empty;
                    const stderr =
                      command.options.stderr === "pipe"
                        ? Stream.make(encoder.encode("warning\n"))
                        : Stream.empty;
                    return Effect.succeed(
                      makeHandle({
                        pid: ProcessId(1234),
                        stdin: Sink.drain,
                        stdout,
                        stderr,
                        all: Stream.merge(stdout, stderr),
                        exitCode: Effect.succeed(ExitCode(0)),
                        isRunning: Effect.succeed(false),
                        kill: () => Effect.void,
                        getInputFd: () => Sink.drain,
                        getOutputFd: () => Stream.empty,
                        unref: Effect.succeed(Effect.void),
                      }),
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
    );

    it.effect("should report a nonzero exit with the script identity", () =>
      Effect.gen(function* () {
        const finalizer = yield* Finalizer;
        const result = yield* Effect.scoped(
          finalizer
            .executeScoped(checkScript, "/repo")
            .pipe(Effect.flatMap((execution) => execution.result)),
        );

        assert(Result.isFailure(result));
        assert.include(result.failure, {
          label: checkScript.label,
          command: checkScript.command,
        });
        assert.include(result.failure.error, "7");
      }).pipe(
        Effect.provide(
          executionLayer(Effect.succeed(ExitCode(7)), Effect.void),
        ),
      ),
    );

    it.effect(
      "should release a running process when the caller closes its scope",
      () =>
        Effect.gen(function* () {
          const running = yield* Ref.make(false);
          const run = Effect.gen(function* () {
            const finalizer = yield* Finalizer;
            yield* finalizer.executeScoped(checkScript, "/repo");
            assert.isTrue(yield* Ref.get(running));
          });

          yield* Effect.scoped(run).pipe(
            Effect.provide(
              executionLayer(
                Effect.never,
                Effect.acquireRelease(Ref.set(running, true), () =>
                  Ref.set(running, false),
                ),
              ),
            ),
          );

          assert.isFalse(yield* Ref.get(running));
        }),
    );
  });
});
