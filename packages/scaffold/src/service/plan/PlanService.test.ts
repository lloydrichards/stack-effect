import assert from "node:assert/strict";
import { describe, expect, it } from "@effect/vitest";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { Plan, PlanFailure, RepoSnapshot } from "@repo/domain/Plan";
import { Cause, Effect, Exit, Layer } from "effect";
import { ContributionResolver } from "./ContributionResolver";
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
          ModuleId.make("domain-api"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api"),
      },
    ],
    edges: [
      {
        id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api"))}`,
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api"),
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
          ModuleId.make("http-api-server"),
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: ModuleId.make("http-api-server"),
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
          ModuleId.make("domain-api"),
        ),
        targetId: domainIdentity.toKey(),
        moduleId: ModuleId.make("domain-api"),
      },
    ],
    edges: [
      {
        id: `owns-module=>apps/server-api=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("http-api-server"))}`,
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("http-api-server"),
        ),
        reason: "owns-module",
      },
      {
        id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api"))}`,
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api"),
        ),
        reason: "owns-module",
      },
      {
        id: `required-target=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("http-api-server"))}=>packages/domain`,
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("http-api-server"),
        ),
        to: domainIdentity.toKey(),
        reason: "required-target",
      },
      {
        id: `required-module=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), ModuleId.make("http-api-server"))}=>${toAttachedModuleNodeId(domainIdentity.toKey(), ModuleId.make("domain-api"))}`,
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          ModuleId.make("http-api-server"),
        ),
        to: toAttachedModuleNodeId(
          domainIdentity.toKey(),
          ModuleId.make("domain-api"),
        ),
        reason: "required-module",
      },
    ],
  }).toSorted();

const getOutcome = (
  plan: typeof Plan.Type,
  path: string,
): typeof Plan.fields.outcomes.schema.Type => {
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
    return yield* planService.build({ blueprint, repoRoot: testRepoRoot });
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
            _tag: "authoritative",
            classification: "create",
          });
          expect(
            getOutcome(plan, "packages/domain/tsconfig.json"),
          ).toMatchObject({
            _tag: "authoritative",
            classification: "create",
          });
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
            _tag: "structural",
            classification: "create",
            requiredStructure: {
              exports: [
                {
                  name: "./Api",
                  value: "./src/Api.ts",
                },
              ],
              scripts: expect.arrayContaining([
                expect.objectContaining({
                  name: "type-check",
                  value: "tsc --noEmit",
                }),
              ]),
            },
          });
          expect(
            getOutcome(plan, "packages/domain/src/index.ts"),
          ).toMatchObject({
            _tag: "structural",
            classification: "create",
            requiredStructure: {
              reExports: ["./Api"],
            },
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
          ).toBe("needsMergeStrategy");
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
          ).toBe("needsMergeStrategy");
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
