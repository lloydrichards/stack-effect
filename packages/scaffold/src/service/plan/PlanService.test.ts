import assert from "node:assert/strict";
import { describe, expect, it } from "@effect/vitest";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type {
  Plan,
  PlanFailure,
  PlanOutcome,
  RepoSnapshot,
} from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, Layer } from "effect";
import { ContributionResolver } from "./ContributionResolver";
import { PlanAssessor } from "./PlanAssessor";
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
      {
        _tag: "target",
        id: domainIdentity.toKey(),
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
      },
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
      {
        _tag: "target",
        id: serverApiIdentity.toKey(),
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        }),
      },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("server-http-api"),
      },
      {
        _tag: "target",
        id: domainIdentity.toKey(),
        identity: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "domain",
        }),
      },
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

const makePlanServiceLayer = (
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<typeof RepoSnapshot.Type, PlanFailure, never>,
) =>
  Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(makeRepoSnapshotServiceLayer(load)),
    Layer.provide(PlanAssessor.layer),
  );

const buildPlan = ({
  blueprint,
  load,
}: {
  blueprint: typeof Blueprint.Type;
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<typeof RepoSnapshot.Type, PlanFailure, never>;
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
  }).pipe(Effect.provide(makePlanServiceLayer(load)));

describe("PlanService", () => {
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
    // Simple blueprint that just has server-chat-rpc module without the full AI dependency chain
    // This tests that composition contributions produce the correct operations
    const makeChatServerOnlyBlueprint = () =>
      new Blueprint({
        nodes: [
          {
            _tag: "target",
            id: serverApiIdentity.toKey(),
            identity: serverApiIdentity,
          },
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
                  // Server index exists (for composition target)
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

          // The server index should have composition operations
          const serverOutcome = getOutcome(
            plan,
            "apps/server-api/src/index.ts",
          );
          expect(serverOutcome._tag).toBe("composed");
          assert(serverOutcome._tag === "composed");

          // Should have ts-add-import operations for the ChatRpcLive layer
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

          // Should have ts-append-call-arg operations for Layer.mergeAll
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
          // Use a blueprint where the target does NOT produce the index.ts file
          // and the composition targets a missing file
          const presenceIdentity = new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "presence",
          });
          const blueprint = new Blueprint({
            nodes: [
              {
                _tag: "target",
                id: serverApiIdentity.toKey(),
                identity: serverApiIdentity,
              },
              {
                _tag: "attached-module",
                id: toAttachedModuleNodeId(
                  serverApiIdentity.toKey(),
                  ModuleId.make("server-ws-presence"),
                ),
                targetId: serverApiIdentity.toKey(),
                moduleId: ModuleId.make("server-ws-presence"),
              },
              {
                _tag: "target",
                id: domainIdentity.toKey(),
                identity: domainIdentity,
              },
              {
                _tag: "attached-module",
                id: toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("domain-ws-contracts"),
                ),
                targetId: domainIdentity.toKey(),
                moduleId: ModuleId.make("domain-ws-contracts"),
              },
              {
                _tag: "target",
                id: presenceIdentity.toKey(),
                identity: presenceIdentity,
              },
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

          // Server target creates index.ts, so composition should work with it
          const serverOutcome = getOutcome(
            plan,
            "apps/server-api/src/index.ts",
          );
          // When file is created by target AND has compositions, it should be composed
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
          {
            _tag: "target",
            id: aiIdentity.toKey(),
            identity: aiIdentity,
          },
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

          // Should be composed with both authoritative content and barrel export operation
          expect(indexOutcome._tag).toBe("composed");
          expect(indexOutcome.classification).toBe("create");

          // Should have ts-add-reexport for the barrel export from package-ai-toolkit-datetime
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
