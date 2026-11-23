import assert from "node:assert/strict";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { describe, expect, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import {
  Blueprint,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  type Plan,
  PlanFailure,
  type PlanOutcome,
  repositoryRootPath,
} from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, FileSystem, Layer, Path } from "effect";
import { ContributionResolver } from "./ContributionResolver";
import { PlanService } from "./PlanService";
import { RepositoryState } from "./RepositoryState";

const testRepositoryRoot = "/repo";
const domainIdentity = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "domain",
});
const serverApiIdentity = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});

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
      makeBlueprintEdge(
        "owns-module",
        domainIdentity.toKey(),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
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
      makeBlueprintEdge(
        "owns-module",
        serverApiIdentity.toKey(),
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
      ),
      makeBlueprintEdge(
        "owns-module",
        domainIdentity.toKey(),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
      makeBlueprintEdge(
        "required-target",
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        domainIdentity.toKey(),
      ),
      makeBlueprintEdge(
        "required-module",
        toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("server-http-api"),
        ),
        toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api-contracts"),
        ),
      ),
    ],
  }).toSorted();

const getOutcome = (plan: Plan, path: string): PlanOutcome => {
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

const PlanTestLayer = Layer.provideMerge(
  PlanService.layer,
  Layer.mergeAll(
    Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
    Path.layer,
    OfficialCatalogLayer,
  ),
);

/** Plan against a memory repository holding `files`, relative to the repository root. */
const buildPlan = ({
  blueprint,
  files = {},
}: {
  blueprint: Blueprint;
  files?: Readonly<Record<string, string>>;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(testRepositoryRoot, { recursive: true });
    yield* Effect.forEach(
      Object.entries(files),
      ([path, contents]) =>
        fileSystem
          .makeDirectory(
            `${testRepositoryRoot}/${path.slice(0, path.lastIndexOf("/"))}`,
            { recursive: true },
          )
          .pipe(
            Effect.andThen(
              fileSystem.writeFileString(
                `${testRepositoryRoot}/${path}`,
                contents,
              ),
            ),
          ),
      { discard: true },
    );

    const planService = yield* PlanService;
    return yield* planService.build({
      blueprint,
      repositoryRoot: testRepositoryRoot,
      config: new StackConfig({
        name: "test-project",
        runtime: { _tag: "bun" },
      }),
    });
  }).pipe(Effect.provide(PlanTestLayer));

describe("PlanService", () => {
  it.effect(
    "should return PlanFailure when projection violates Plan invariants",
    () =>
      Effect.gen(function* () {
        // Capture deduplicates paths on a real filesystem, so only a substituted
        // capture can yield a baseline that the Plan schema rejects.
        const duplicated = {
          paths: [
            { _tag: "missing" as const, path: repositoryRootPath },
            { _tag: "missing" as const, path: repositoryRootPath },
          ],
        };
        const repositoryState = RepositoryState.of({
          capture: () =>
            Effect.succeed({
              baseline: {
                root: testRepositoryRoot,
                packageOwners: [],
                ...duplicated,
              },
              snapshot: duplicated,
            }),
          verify: () => Effect.succeed([]),
          discoverOwners: () => Effect.succeed([]),
        });
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            const planService = yield* PlanService;
            return yield* planService.build({
              blueprint: makeDomainBlueprint(),
              repositoryRoot: testRepositoryRoot,
              config: new StackConfig({
                name: "test-project",
                runtime: { _tag: "bun" },
              }),
            });
          }).pipe(
            Effect.provide(
              Layer.effect(PlanService)(PlanService.make).pipe(
                Layer.provide(ContributionResolver.layer),
                Layer.provide(Layer.succeed(RepositoryState, repositoryState)),
                Layer.provide(OfficialCatalogLayer),
              ),
            ),
          ),
        );

        const failure = squashFailure(exit);
        expect(failure).toBeInstanceOf(PlanFailure);
        expect(failure).toMatchObject({
          message: expect.stringContaining("Invalid projected Plan"),
        });
      }),
  );

  describe("when building target plans", () => {
    it.effect(
      "should classify projected target and module files as create when they are missing",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeServerApiBlueprint(),
          });

          expect(
            getOutcome(plan, "apps/server-api/src/index.ts").classification,
          ).toBe("create");
          expect(
            getOutcome(plan, "apps/server-api/src/api/Health.ts")
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
          makeBlueprintEdge(
            "owns-module",
            serverApiIdentity.toKey(),
            toAttachedModuleNodeId(
              serverApiIdentity.toKey(),
              ModuleId.make("server-chat-rpc"),
            ),
          ),
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
            files: { "apps/server-api/src/index.ts": serverIndexContents },
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
                moduleSpecifier: "./rpc/Chat",
                namedImports: ["ChatRpcRoutes"],
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
                argument: "ChatRpcRoutes",
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
              makeBlueprintEdge(
                "owns-module",
                serverApiIdentity.toKey(),
                toAttachedModuleNodeId(
                  serverApiIdentity.toKey(),
                  ModuleId.make("server-ws-presence"),
                ),
              ),
              makeBlueprintEdge(
                "owns-module",
                domainIdentity.toKey(),
                toAttachedModuleNodeId(
                  domainIdentity.toKey(),
                  ModuleId.make("domain-ws-contracts"),
                ),
              ),
              makeBlueprintEdge(
                "owns-module",
                presenceIdentity.toKey(),
                toAttachedModuleNodeId(
                  presenceIdentity.toKey(),
                  ModuleId.make("package-presence-service"),
                ),
              ),
            ],
          }).toSorted();

          const plan = yield* buildPlan({
            blueprint,
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
            files: {
              "packages/domain/package.json": JSON.stringify({
                name: "@repo/domain",
                exports: { "./Api": "./src/Other.ts" },
              }),
            },
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
            files: {
              "packages/domain/src/index.ts": 'export { Api } from "./Api";',
            },
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
          makeBlueprintEdge(
            "owns-module",
            aiIdentity.toKey(),
            toAttachedModuleNodeId(
              aiIdentity.toKey(),
              ModuleId.make("package-ai-core"),
            ),
          ),
          makeBlueprintEdge(
            "owns-module",
            aiIdentity.toKey(),
            toAttachedModuleNodeId(
              aiIdentity.toKey(),
              ModuleId.make("package-ai-toolkit-datetime"),
            ),
          ),
        ],
      }).toSorted();

    it.effect(
      "should combine authoritative content with barrel exports in a single composed outcome",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeAiBlueprint(),
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
            files: { "packages/ai/src/index.ts": existingContents },
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
            files: { "packages/ai/src/index.ts": existingContents },
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
            files: {
              "packages/ai/src/index.ts":
                '// Custom index with named exports\nexport { FastModelLayer } from "./LanguageModel";',
            },
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
          const failure = yield* Effect.flip(
            buildPlan({
              blueprint: makeDomainBlueprint(),
              files: { "packages/domain": "not a directory" },
            }),
          );

          expect(failure._tag).toBe("PlanFailure");
          expect(failure.message).toMatch(
            /^Could not inspect packages\/domain\/\S+ during planning/,
          );
        }),
    );
  });
});
