import assert from "node:assert/strict";
import { describe, expect, it } from "@effect/vitest";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import {
  ClassicArchitecture,
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  type Plan,
  PlanFailure,
  type PlanOutcome,
  type RepoSnapshot,
} from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, Layer } from "effect";
import { BlueprintService } from "../blueprint/BlueprintService";
import { ContributionResolver } from "./ContributionResolver";
import { PlanAssessor } from "./PlanAssessor";
import { PlanningIntentCompiler } from "./PlanningIntentCompiler";
import { PlanService } from "./PlanService";
import { RepoSnapshotService } from "./RepoSnapshotService";

const testRepoRoot = "/repo";
const domainIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const serverApiIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});

const classicTarget = (identity: TargetIdentity) => ({
  _tag: "target" as const,
  id: identity.toKey(),
  identity,
  architecture: ClassicArchitecture,
  layout: {
    path: identity.toPath(),
    packageName: identity.toPackageName(),
  },
});

const makeRepoSnapshotServiceLayer = (
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<typeof RepoSnapshot.Type, PlanFailure, never>,
) =>
  Layer.succeed(RepoSnapshotService, {
    load: Effect.fn("MockRepoSnapshotService.load")(load),
  } as never);

const makeDomainBlueprint = () =>
  new Blueprint({
    nodes: [
      classicTarget(domainIdentity),
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api-contracts"),
      },
    ],
    edges: [
      {
        id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api-contracts"))}`,
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "owns-module",
      },
    ],
  }).toSorted();

const makeServerApiBlueprint = () =>
  new Blueprint({
    nodes: [
      classicTarget(serverApiIdentity),
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("server-http-api"),
      },
      classicTarget(domainIdentity),
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api-contracts"),
      },
    ],
    edges: [
      {
        id: `owns-module=>apps/server-api=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-http-api"))}`,
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        reason: "owns-module",
      },
      {
        id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api-contracts"))}`,
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "owns-module",
      },
      {
        id: `required-target=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-http-api"))}=>packages/domain`,
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        to: domainIdentity.toKey(),
        reason: "required-target",
      },
      {
        id: `required-module=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-http-api"))}=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api-contracts"))}`,
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
        reason: "required-module",
      },
    ],
  }).toSorted();

const getOutcome = (
  plan: typeof Plan.Type,
  path: string,
): typeof PlanOutcome.Type => {
  const outcome = plan.outcomes.find((candidate) => candidate.path === path);
  expect(outcome).toBeDefined();
  assert(
    outcome !== undefined,
    `Expected planned file outcome ${path} to exist`,
  );
  return outcome;
};

const squashFailure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  assert(Exit.isFailure(exit), "Expected effect to fail");
  return Cause.squash(exit.cause);
};

const makePlanServiceLayer = (
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<typeof RepoSnapshot.Type, PlanFailure, never>,
  assessorLayer = PlanAssessor.layer,
) =>
  Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(PlanningIntentCompiler.layer),
    Layer.provide(makeRepoSnapshotServiceLayer(load)),
    Layer.provide(assessorLayer),
  );

const buildPlan = ({
  blueprint,
  load,
  assessorLayer,
}: {
  blueprint: typeof Blueprint.Type;
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<typeof RepoSnapshot.Type, PlanFailure, never>;
  assessorLayer?: Layer.Layer<PlanAssessor>;
}) =>
  Effect.gen(function* () {
    const planService = yield* PlanService;
    return yield* planService.build({
      blueprint,
      repoRoot: testRepoRoot,
      config: new StackConfig({
        name: "test-project",
        runtime: { _tag: "bun" },
      }),
    });
  }).pipe(Effect.provide(makePlanServiceLayer(load, assessorLayer)));

describe("PlanService", () => {
  it.effect(
    "should return PlanFailure when projection violates Plan invariants",
    () =>
      Effect.gen(function* () {
        const invalidAssessorLayer = Layer.effect(PlanAssessor)(
          PlanAssessor.make.pipe(
            Effect.map((assessor) => ({
              ...assessor,
              assessPlanningPath: (input) => ({
                ...assessor.assessPlanningPath(input),
                classification: "conflict" as const,
                conflicts: [],
              }),
            })),
          ),
        );

        const exit = yield* Effect.exit(
          buildPlan({
            blueprint: makeDomainBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
            assessorLayer: invalidAssessorLayer,
          }),
        );

        const failure = squashFailure(exit);
        expect(failure).toBeInstanceOf(PlanFailure);
        expect(failure).toMatchObject({ reason: "invalidPlanIntent" });
      }),
  );

  describe("real catalog architecture integration", () => {
    it.effect(
      "keeps DDD workspace composition and nested modules on their owning targets while Classic stays flat",
      () =>
        Effect.gen(function* () {
          const blueprintService = yield* BlueprintService;
          const planService = yield* PlanService;
          const selection = (architecture?: typeof DddArchitecture) => ({
            targets: [
              {
                identity: new TargetIdentity({
                  kind: TargetKind.make("server"),
                  name: architecture === DddArchitecture ? "api" : "todo",
                }),
                ...(architecture === undefined ? {} : { architecture }),
                modules: [
                  { id: ModuleId.make("server-http-api-todos") },
                  ...(architecture === DddArchitecture
                    ? [
                        {
                          id: ModuleId.make(
                            "server-http-api-todos-provider-sqlite",
                          ),
                        },
                        {
                          id: ModuleId.make(
                            "server-http-api-todos-provider-postgres",
                          ),
                        },
                      ]
                    : []),
                ],
              },
              ...(architecture === undefined
                ? [
                    {
                      identity: new TargetIdentity({
                        kind: TargetKind.make("package"),
                        name: "db",
                      }),
                      modules: [{ id: ModuleId.make("package-db-sqlite") }],
                    },
                  ]
                : []),
            ],
          });
          const build = (blueprint: typeof Blueprint.Type) =>
            planService.build({
              blueprint,
              repoRoot: testRepoRoot,
              config: new StackConfig({
                name: "test-project",
                runtime: { _tag: "bun" },
              }),
            });

          const dddBlueprint = yield* blueprintService.resolve(
            selection(DddArchitecture),
          );
          const dddPlan = yield* build(dddBlueprint);
          expect(getOutcome(dddPlan, "package.json")).toMatchObject({
            _tag: "composed",
            operations: expect.arrayContaining([
              {
                _tag: "json-array-entry",
                fileType: "json",
                field: "workspaces",
                value: "packages/*/*",
              },
            ]),
          });
          expect(getOutcome(dddPlan, "pnpm-workspace.yaml")).toMatchObject({
            _tag: "composed",
            operations: [
              {
                _tag: "yaml-sequence-entry",
                fileType: "yaml",
                key: "packages",
                value: "packages/*/*",
              },
            ],
          });
          const attached = dddBlueprint.nodes.filter(
            (node) => node._tag === "attached-module",
          );
          expect(
            attached.filter(
              (node) => node.moduleId === "workspace-context-packages",
            ),
          ).toEqual([expect.objectContaining({ targetId: "." })]);
          for (const [moduleId, targetId] of [
            ["package-todo-domain", "packages/todo-domain"],
            ["package-todo-application", "packages/todo-application"],
            ["package-todo-infrastructure", "packages/todo-infrastructure"],
            ["package-todo-presentation-http", "packages/todo-presentation"],
          ] as const) {
            expect(
              attached.filter((node) => node.moduleId === moduleId),
            ).toEqual([expect.objectContaining({ targetId })]);
          }
          const dddTargets = dddBlueprint.nodes
            .filter((node) => node._tag === "target")
            .filter((node) => node.identity.kind !== "workspace")
            .map((node) => ({
              id: node.id,
              architecture: node.architecture,
              path: node.layout.path,
              packageName: node.layout.packageName,
            }));
          expect(dddTargets).toHaveLength(6);
          expect(dddTargets).toEqual(
            expect.arrayContaining([
              {
                id: "apps/server-api",
                architecture: "ddd",
                path: "apps/server-api",
                packageName: "server-api",
              },
              {
                id: "packages/shared-domain",
                architecture: "ddd",
                path: "packages/shared/domain",
                packageName: "@repo/shared-domain",
              },
              {
                id: "packages/todo-domain",
                architecture: "ddd",
                path: "packages/todo/domain",
                packageName: "@repo/todo-domain",
              },
              {
                id: "packages/todo-application",
                architecture: "ddd",
                path: "packages/todo/application",
                packageName: "@repo/todo-application",
              },
              {
                id: "packages/todo-infrastructure",
                architecture: "ddd",
                path: "packages/todo/infrastructure",
                packageName: "@repo/todo-infrastructure",
              },
              {
                id: "packages/todo-presentation",
                architecture: "ddd",
                path: "packages/todo/presentation",
                packageName: "@repo/todo-presentation",
              },
            ]),
          );
          expect(
            dddBlueprint.nodes.some(
              (node) =>
                node._tag === "attached-module" &&
                [
                  "domain-todo-rpc-contracts",
                  "package-db-todo-repository",
                ].includes(node.moduleId),
            ),
          ).toBe(false);
          [
            "packages/todo/domain/test/http.test.ts",
            "packages/todo/domain/test/todo.test.ts",
            "packages/todo/application/test/use-cases.test.ts",
            "packages/todo/infrastructure/test/memory.test.ts",
            "packages/todo/infrastructure/test/sqlite.test.ts",
            "packages/todo/presentation/test/http.test.ts",
          ].forEach((path) => expect(getOutcome(dddPlan, path)).toBeDefined());
          expect(
            dddPlan.outcomes.some(
              (outcome) =>
                outcome.path.includes("/src/") &&
                outcome.path.endsWith(".test.ts"),
            ),
          ).toBe(false);
          expect(
            dddBlueprint.nodes.some(
              (node) =>
                node._tag === "target" &&
                ["packages/domain", "packages/db"].includes(node.id),
            ),
          ).toBe(false);

          const classicBlueprint = yield* blueprintService.resolve(selection());
          const classicPlan = yield* build(classicBlueprint);
          expect(
            classicPlan.outcomes.some(
              (outcome) =>
                outcome._tag === "composed" &&
                outcome.operations.some(
                  (op) =>
                    op._tag === "json-array-entry" ||
                    op._tag === "yaml-sequence-entry",
                ),
            ),
          ).toBe(false);
          expect(
            classicBlueprint.nodes.some(
              (node) =>
                node._tag === "target" &&
                node.id === "apps/server-todo" &&
                node.layout.path === "apps/server-todo",
            ),
          ).toBe(true);
        }).pipe(
          Effect.provide(
            Layer.merge(
              BlueprintService.layer,
              makePlanServiceLayer(({ paths }) =>
                Effect.succeed({
                  paths: paths.map((path) => ({
                    _tag: "missing" as const,
                    path,
                  })),
                }),
              ),
            ),
          ),
        ),
    );
  });

  describe("when building target plans", () => {
    it.effect(
      "should classify projected target and module files as create when they are missing",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeServerApiBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
          });

          expect(
            getOutcome(plan, "apps/server-api/src/index.ts").classification,
          ).toBe("create");
          expect(
            getOutcome(plan, "apps/server-api/src/Api/Health.ts")
              .classification,
          ).toBe("create");
          expect(
            getOutcome(plan, "packages/domain/src/Api.ts").classification,
          ).toBe("create");
        }),
    );

    it.effect(
      "should emit authoritative outcomes for scaffold-owned files including tsconfig",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeDomainBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
          });

          expect(getOutcome(plan, "packages/domain/src/Api.ts")).toMatchObject({
            _tag: "complete",
            classification: "create",
          });
          expect(
            getOutcome(plan, "packages/domain/tsconfig.json"),
          ).toMatchObject({
            _tag: "complete",
            classification: "create",
          });
        }),
    );
  });

  describe("when planning compositions", () => {
    // NOTE: This fixture isolates server-chat-rpc so composition operations are the only behavior under test.
    const makeChatServerOnlyBlueprint = () =>
      new Blueprint({
        nodes: [
          classicTarget(serverApiIdentity),
          {
            _tag: "attached-module",
            id: toAttachedModuleNodeId(
              serverApiIdentity.toKey(),
              ModuleId.make("server-chat-rpc"),
            ),
            targetId: serverApiIdentity.toKey(),
            moduleId: ModuleId.make("server-chat-rpc"),
          },
        ],
        edges: [
          {
            id: `owns-module=>apps/server-api=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-chat-rpc"))}`,
            from: serverApiIdentity.toKey(),
            to: toAttachedModuleNodeId(
              serverApiIdentity.toKey(),
              ModuleId.make("server-chat-rpc"),
            ),
            reason: "owns-module",
          },
        ],
      }).toSorted();

    it.effect(
      "should emit composition operations when module declares compositions",
      () =>
        Effect.gen(function* () {
          const serverIndexContents = `import { Layer } from "effect";
const HttpRpcRouter = Layer.empty;
`;
          const plan = yield* buildPlan({
            blueprint: makeChatServerOnlyBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "apps/server-api/src/index.ts") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: serverIndexContents,
                    };
                  }
                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          const serverOutcome = getOutcome(
            plan,
            "apps/server-api/src/index.ts",
          );
          expect(serverOutcome._tag).toBe("composed");
          assert(serverOutcome._tag === "composed");

          const importOps = serverOutcome.operations.filter(
            (op) => op._tag === "ts-add-import",
          );
          expect(importOps).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "ts-add-import",
                moduleSpecifier: "./Rpc/Chat",
                namedImports: ["ChatRpcLive"],
              }),
            ]),
          );

          const appendOps = serverOutcome.operations.filter(
            (op) => op._tag === "ts-append-call-arg",
          );
          expect(appendOps).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "ts-append-call-arg",
                targetVariable: "AllRouters",
                functionName: "Layer.mergeAll",
                argument: "ChatRpcLive",
              }),
            ]),
          );
        }),
    );

    it.effect(
      "should report conflict when composition target file is missing and not created by target",
      () =>
        Effect.gen(function* () {
          const presenceIdentity = new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "presence",
          });
          const blueprint = new Blueprint({
            nodes: [
              classicTarget(serverApiIdentity),
              {
                _tag: "attached-module",
                id: toAttachedModuleNodeId(
                  serverApiIdentity.toKey(),
                  ModuleId.make("server-ws-presence"),
                ),
                targetId: serverApiIdentity.toKey(),
                moduleId: ModuleId.make("server-ws-presence"),
              },
              classicTarget(domainIdentity),
              {
                _tag: "attached-module",
                id: toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("domain-ws-contracts"),
                ),
                targetId: domainIdentity.toKey(),
                moduleId: ModuleId.make("domain-ws-contracts"),
              },
              classicTarget(presenceIdentity),
              {
                _tag: "attached-module",
                id: toAttachedModuleNodeId(
                  presenceIdentity.toKey(),
                  ModuleId.make("package-presence-service"),
                ),
                targetId: presenceIdentity.toKey(),
                moduleId: ModuleId.make("package-presence-service"),
              },
            ],
            edges: [
              {
                id: `owns-module=>apps/server-api=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("server-ws-presence"))}`,
                from: serverApiIdentity.toKey(),
                to: toAttachedModuleNodeId(
                  serverApiIdentity.toKey(),
                  ModuleId.make("server-ws-presence"),
                ),
                reason: "owns-module",
              },
              {
                id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-ws-contracts"))}`,
                from: domainIdentity.toKey(),
                to: toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("domain-ws-contracts"),
                ),
                reason: "owns-module",
              },
              {
                id: `owns-module=>packages/presence=>${toAttachedModuleNodeId(presenceIdentity.toKey(), ModuleId.make("package-presence-service"))}`,
                from: presenceIdentity.toKey(),
                to: toAttachedModuleNodeId(
                  presenceIdentity.toKey(),
                  ModuleId.make("package-presence-service"),
                ),
                reason: "owns-module",
              },
            ],
          }).toSorted();

          const plan = yield* buildPlan({
            blueprint,
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
          });

          const serverOutcome = getOutcome(
            plan,
            "apps/server-api/src/index.ts",
          );
          expect(serverOutcome._tag).toBe("composed");
        }),
    );
  });

  describe("when planning merges", () => {
    it.effect(
      "should emit structural outcomes with required structure for package files",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeDomainBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
          });

          expect(
            getOutcome(plan, "packages/domain/package.json"),
          ).toMatchObject({
            _tag: "composed",
            classification: "create",
            operations: expect.arrayContaining([
              expect.objectContaining({
                _tag: "json-pkg-exports",
                entries: [
                  {
                    name: "./Api",
                    value: "./src/Api.ts",
                  },
                ],
              }),
              expect.objectContaining({
                _tag: "json-pkg-scripts",
                entries: expect.arrayContaining([
                  expect.objectContaining({
                    name: "type-check",
                    value: "tsc --noEmit",
                  }),
                ]),
              }),
            ]),
          });
          expect(
            getOutcome(plan, "packages/domain/src/index.ts"),
          ).toMatchObject({
            _tag: "composed",
            classification: "create",
            operations: [{ _tag: "ts-add-reexport", moduleSpecifier: "./Api" }],
          });
        }),
    );

    it.effect(
      "should require a package.json merge strategy when existing exports conflict",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeDomainBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "packages/domain/package.json") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: JSON.stringify({
                        exports: { "./Api": "./src/Other.ts" },
                      }),
                    };
                  }

                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          expect(
            getOutcome(plan, "packages/domain/package.json").classification,
          ).toBe("conflict");
          expect(plan.conflicts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "exports",
                path: "packages/domain/package.json",
                name: "./Api",
              }),
            ]),
          );
        }),
    );

    it.effect(
      "should require a barrel merge strategy when the barrel cannot be parsed",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeDomainBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "packages/domain/src/index.ts") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: 'export { Api } from "./Api";',
                    };
                  }

                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          expect(
            getOutcome(plan, "packages/domain/src/index.ts").classification,
          ).toBe("conflict");
          expect(plan.conflicts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "barrelExport",
                path: "packages/domain/src/index.ts",
                exportPath: "./Api",
              }),
            ]),
          );
        }),
    );
  });

  describe("when planning authoritative + barrel combinations", () => {
    const aiIdentity = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "ai",
    });

    const makeAiBlueprint = () =>
      new Blueprint({
        nodes: [
          classicTarget(aiIdentity),
          {
            _tag: "attached-module",
            id: toAttachedModuleNodeId(
              aiIdentity.toKey(),
              ModuleId.make("package-ai-core"),
            ),
            targetId: aiIdentity.toKey(),
            moduleId: ModuleId.make("package-ai-core"),
          },
          {
            _tag: "attached-module",
            id: toAttachedModuleNodeId(
              aiIdentity.toKey(),
              ModuleId.make("package-ai-toolkit-datetime"),
            ),
            targetId: aiIdentity.toKey(),
            moduleId: ModuleId.make("package-ai-toolkit-datetime"),
          },
        ],
        edges: [
          {
            id: `owns-module=>packages/ai=>${toAttachedModuleNodeId(aiIdentity.toKey(), ModuleId.make("package-ai-core"))}`,
            from: aiIdentity.toKey(),
            to: toAttachedModuleNodeId(
              aiIdentity.toKey(),
              ModuleId.make("package-ai-core"),
            ),
            reason: "owns-module",
          },
          {
            id: `owns-module=>packages/ai=>${toAttachedModuleNodeId(aiIdentity.toKey(), ModuleId.make("package-ai-toolkit-datetime"))}`,
            from: aiIdentity.toKey(),
            to: toAttachedModuleNodeId(
              aiIdentity.toKey(),
              ModuleId.make("package-ai-toolkit-datetime"),
            ),
            reason: "owns-module",
          },
        ],
      }).toSorted();

    it.effect(
      "should combine authoritative content with barrel exports in a single composed outcome",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeAiBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
          });

          const indexOutcome = getOutcome(plan, "packages/ai/src/index.ts");

          expect(indexOutcome._tag).toBe("composed");
          expect(indexOutcome.classification).toBe("create");

          expect(indexOutcome).toMatchObject({
            operations: expect.arrayContaining([
              expect.objectContaining({
                _tag: "ts-add-reexport",
                moduleSpecifier: "./toolkits/DateTimeToolkit",
              }),
            ]),
          });
        }),
    );

    it.effect(
      "should detect unchanged when authoritative + barrel already present",
      () =>
        Effect.gen(function* () {
          const existingContents = `export * from "./LanguageModel";
export * from "./toolkits/DateTimeToolkit";
`;

          const plan = yield* buildPlan({
            blueprint: makeAiBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "packages/ai/src/index.ts") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: existingContents,
                    };
                  }
                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          const indexOutcome = getOutcome(plan, "packages/ai/src/index.ts");
          expect(indexOutcome.classification).toBe("unchanged");
        }),
    );

    it.effect(
      "should detect modify when authoritative present but barrel export missing",
      () =>
        Effect.gen(function* () {
          const existingContents = `export * from "./LanguageModel";
`;

          const plan = yield* buildPlan({
            blueprint: makeAiBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "packages/ai/src/index.ts") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: existingContents,
                    };
                  }
                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          const indexOutcome = getOutcome(plan, "packages/ai/src/index.ts");
          expect(indexOutcome.classification).toBe("modify");
        }),
    );

    it.effect(
      "should conflict when existing file cannot be parsed as barrel",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeAiBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "packages/ai/src/index.ts") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents:
                        '// Custom index with named exports\nexport { FastModelLive } from "./LanguageModel";',
                    };
                  }
                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          const indexOutcome = getOutcome(plan, "packages/ai/src/index.ts");
          expect(indexOutcome.classification).toBe("conflict");
          expect(plan.conflicts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "barrelExport",
                path: "packages/ai/src/index.ts",
                exportPath: "./toolkits/DateTimeToolkit",
              }),
            ]),
          );
        }),
    );
  });

  describe("when planning against an invalid repo snapshot", () => {
    it.effect(
      "should fail when an ancestor path is a file instead of a directory",
      () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            buildPlan({
              blueprint: makeDomainBlueprint(),
              load: ({ paths }) =>
                Effect.succeed({
                  paths: paths.map((path) =>
                    path === "packages"
                      ? {
                          _tag: "file" as const,
                          path,
                          contents: "not a directory",
                        }
                      : { _tag: "missing" as const, path },
                  ),
                }),
            }),
          );

          expect(Exit.isFailure(exit)).toBe(true);
          assert(Exit.isFailure(exit));
          expect(Cause.squash(exit.cause)).toMatchObject({
            _tag: "PlanFailure",
            reason: "repoRootNotEmpty",
            message: "Expected packages to be a directory during planning.",
          });
        }),
    );
  });
});
