import assert from "node:assert/strict";
import { describe, expect, it } from "@effect/vitest";
import { Blueprint, toAttachedModuleNodeId } from "@repo/domain/Blueprint";
import type {
  Plan,
  PlanDirectoryEntry,
  PlanFailure,
  PlanFileEntry,
  RepoSnapshot,
} from "@repo/domain/Plan";
import { TargetIdentity } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, Layer } from "effect";
import { ContributionResolver } from "./ContributionResolver";
import { PlanService } from "./PlanService";
import { RepoSnapshotService } from "./RepoSnapshotService";

const testRepoRoot = "/repo";
const domainIdentity = new TargetIdentity({ kind: "package", name: "domain" });
const serverApiIdentity = new TargetIdentity({ kind: "server", name: "api" });

const makeRepoSnapshotServiceLayer = (
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<RepoSnapshot, PlanFailure, never>,
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
          kind: "package",
          name: "domain",
        }),
      },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        targetId: domainIdentity.toKey(),
        moduleId: "domain-api",
      },
    ],
    edges: [
      {
        id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api")}`,
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
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
          kind: "server",
          name: "api",
        }),
      },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          "http-api-server",
        ),
        targetId: serverApiIdentity.toKey(),
        moduleId: "http-api-server",
      },
      {
        _tag: "target",
        id: domainIdentity.toKey(),
        identity: new TargetIdentity({
          kind: "package",
          name: "domain",
        }),
      },
      {
        _tag: "attached-module",
        id: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        targetId: domainIdentity.toKey(),
        moduleId: "domain-api",
      },
    ],
    edges: [
      {
        id: `owns-module=>apps/server-api=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), "http-api-server")}`,
        from: serverApiIdentity.toKey(),
        to: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          "http-api-server",
        ),
        reason: "owns-module",
      },
      {
        id: `owns-module=>packages/domain=>${toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api")}`,
        from: domainIdentity.toKey(),
        to: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        reason: "owns-module",
      },
      {
        id: `required-target=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), "http-api-server")}=>packages/domain`,
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          "http-api-server",
        ),
        to: domainIdentity.toKey(),
        reason: "required-target",
      },
      {
        id: `required-module=>${toAttachedModuleNodeId(serverApiIdentity.toKey(), "http-api-server")}=>${toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api")}`,
        from: toAttachedModuleNodeId(
          serverApiIdentity.toKey(),
          "http-api-server",
        ),
        to: toAttachedModuleNodeId(domainIdentity.toKey(), "domain-api"),
        reason: "required-module",
      },
    ],
  }).toSorted();

const getFileEntry = (plan: Plan, path: string): PlanFileEntry => {
  const entry = plan.entries.find(
    (candidate): candidate is PlanFileEntry =>
      candidate._tag === "file" && candidate.path === path,
  );
  expect(entry).toBeDefined();
  assert(entry !== undefined, `Expected file plan entry ${path} to exist`);
  return entry;
};

const getDirectoryEntry = (plan: Plan, path: string): PlanDirectoryEntry => {
  const entry = plan.entries.find(
    (candidate): candidate is PlanDirectoryEntry =>
      candidate._tag === "directory" && candidate.path === path,
  );
  expect(entry).toBeDefined();
  assert(entry !== undefined, `Expected directory plan entry ${path} to exist`);
  return entry;
};

const makePlanServiceLayer = (
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<RepoSnapshot, PlanFailure, never>,
) =>
  Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(makeRepoSnapshotServiceLayer(load)),
  );

const buildPlan = ({
  blueprint,
  load,
}: {
  blueprint: Blueprint;
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<RepoSnapshot, PlanFailure, never>;
}) =>
  Effect.gen(function* () {
    const planService = yield* PlanService;
    return yield* planService.build({ blueprint, repoRoot: testRepoRoot });
  }).pipe(Effect.provide(makePlanServiceLayer(load)));

describe("PlanService", () => {
  describe("when compiling plan inspection paths", () => {
    it.effect(
      "should request projected files and ancestor directories for selected targets and modules",
      () =>
        Effect.gen(function* () {
          const requested: Array<string> = [];

          yield* buildPlan({
            blueprint: makeServerApiBlueprint(),
            load: ({ paths }) => {
              requested.push(...paths);
              return Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              });
            },
          });

          expect(requested).toEqual(
            expect.arrayContaining([
              "apps",
              "apps/server-api",
              "apps/server-api/package.json",
              "apps/server-api/src",
              "apps/server-api/src/index.ts",
              "apps/server-api/src/Api/Health.ts",
              "packages",
              "packages/domain/package.json",
              "packages/domain/src/Api.ts",
            ]),
          );
        }),
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

          expect(getDirectoryEntry(plan, "apps/server-api")).toBeDefined();
          expect(
            getFileEntry(plan, "apps/server-api/src/index.ts").classification,
          ).toBe("create");
          expect(
            getFileEntry(plan, "apps/server-api/src/Api/Health.ts")
              .classification,
          ).toBe("create");
          expect(
            getFileEntry(plan, "packages/domain/src/Api.ts").classification,
          ).toBe("create");
        }),
    );
  });

  describe("when planning merges", () => {
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
            getFileEntry(plan, "packages/domain/package.json").classification,
          ).toBe("needsMergeStrategy");
          expect(plan.conflicts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "packageJsonExports",
                path: "packages/domain/package.json",
                exportKey: "./Api",
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
            getFileEntry(plan, "packages/domain/src/index.ts").classification,
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
