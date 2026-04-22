import assert from "node:assert/strict";
import { describe, expect, it } from "@effect/vitest";
import { Blueprint } from "@repo/domain/Blueprint";
import type {
  Plan,
  PlanDirectoryEntry,
  PlanFailure,
  PlanFileEntry,
  RepoSnapshot,
} from "@repo/domain/Plan";
import { Cause, Effect, Exit, Layer } from "effect";
import { rootBootstrapFiles } from "../registry/content/root-bootstrap";
import { PlanService } from "./PlanService";
import { RepoSnapshotService } from "./RepoSnapshotService";

const testRepoRoot = "/repo";

const makeRepoSnapshotServiceLayer = (
  load: (args: {
    readonly paths: ReadonlyArray<string>;
    readonly repoRoot: string;
  }) => Effect.Effect<RepoSnapshot, PlanFailure, never>,
) =>
  Layer.succeed(RepoSnapshotService, {
    load: Effect.fn("MockRepoSnapshotService.load")(load),
  } as never);

const makeRepoOnlyBlueprint = () =>
  new Blueprint({
    nodes: [],
    edges: [],
    modules: [
      {
        moduleId: "root-bootstrap",
        status: "selected",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "repo-module",
              id: "root-bootstrap",
            },
          },
        ],
      },
    ],
    warnings: [],
  }).toSorted();

const makeDomainBlueprint = () =>
  new Blueprint({
    nodes: [
      {
        id: "packages/domain",
        identity: {
          kind: "package",
          name: "domain",
        },
        status: "selected",
        causes: [
          {
            _tag: "selection",
            source: {
              _tag: "target",
              id: "packages/domain",
            },
          },
        ],
        targetModules: [
          {
            moduleId: "domain-api",
            status: "selected",
            causes: [
              {
                _tag: "selection",
                source: {
                  _tag: "target-module",
                  targetId: "packages/domain",
                  moduleId: "domain-api",
                },
              },
            ],
          },
        ],
        composition: {
          _tag: "package",
          publicEntrypoint: "./Api",
        },
      },
    ],
    edges: [],
    modules: [
      {
        moduleId: "root-bootstrap",
        status: "implied",
        causes: [
          {
            _tag: "dependency",
            edgeId:
              "required-repo-module=>target:packages/domain=>repo-module:root-bootstrap",
          },
        ],
      },
    ],
    warnings: [],
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
      "should request projected files and ancestor directories for repo bootstrap",
      () =>
        Effect.gen(function* () {
          const requested: Array<string> = [];

          yield* buildPlan({
            blueprint: makeRepoOnlyBlueprint(),
            load: ({ paths }) => {
              requested.push(...paths);
              return Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              });
            },
          });

          expect(requested).toEqual([
            ".gitignore",
            "package.json",
            "packages",
            "packages/config-typescript",
            "packages/config-typescript/base.json",
            "turbo.json",
          ]);
        }),
    );
  });

  describe("when building repo bootstrap plans", () => {
    it.effect(
      "should classify projected root bootstrap files as create when they are missing",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeRepoOnlyBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => ({ _tag: "missing", path })),
              }),
          });

          expect(getDirectoryEntry(plan, "packages").causes).toEqual([
            { _tag: "selectedRepoModule", moduleId: "root-bootstrap" },
          ]);
          expect(getFileEntry(plan, ".gitignore").classification).toBe(
            "create",
          );
          expect(getFileEntry(plan, "package.json").classification).toBe(
            "create",
          );
          expect(
            getFileEntry(plan, "packages/config-typescript/base.json")
              .classification,
          ).toBe("create");
          expect(plan.mergeRequirements).toEqual([]);
          expect(plan.warnings).toEqual([]);
        }),
    );

    it.effect(
      "should classify authoritative files as unchanged when contents already match",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeRepoOnlyBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "package.json") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: rootBootstrapFiles["package.json"],
                    };
                  }

                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          expect(getFileEntry(plan, "package.json").classification).toBe(
            "unchanged",
          );
          expect(getFileEntry(plan, ".gitignore").classification).toBe(
            "create",
          );
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
          expect(plan.mergeRequirements).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "packageJsonExports",
                path: "packages/domain/package.json",
                exportKey: "./Api",
              }),
            ]),
          );
          expect(plan.warnings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "mergeStrategyRequired",
                path: "packages/domain/package.json",
                message: "Existing exports require manual merge strategy.",
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
          expect(plan.mergeRequirements).toEqual(
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

    it.effect(
      "should require a tsconfig merge strategy when the existing tsconfig differs",
      () =>
        Effect.gen(function* () {
          const plan = yield* buildPlan({
            blueprint: makeDomainBlueprint(),
            load: ({ paths }) =>
              Effect.succeed({
                paths: paths.map((path) => {
                  if (path === "packages/domain/tsconfig.json") {
                    return {
                      _tag: "file" as const,
                      path,
                      contents: '{"extends":"./other.json"}',
                    };
                  }

                  return { _tag: "missing" as const, path };
                }),
              }),
          });

          expect(
            getFileEntry(plan, "packages/domain/tsconfig.json").classification,
          ).toBe("needsMergeStrategy");
          expect(plan.mergeRequirements).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "tsconfig",
                path: "packages/domain/tsconfig.json",
              }),
            ]),
          );
          expect(plan.warnings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "mergeStrategyRequired",
                path: "packages/domain/tsconfig.json",
                message:
                  "Existing tsconfig.json requires manual merge strategy.",
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

    it.effect(
      "should fail when a projected file path resolves to a directory",
      () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            buildPlan({
              blueprint: makeDomainBlueprint(),
              load: ({ paths }) =>
                Effect.succeed({
                  paths: paths.map((path) =>
                    path === "packages/domain/tsconfig.json"
                      ? {
                          _tag: "directory" as const,
                          path,
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
            message:
              "Expected packages/domain/tsconfig.json to be a file during planning.",
          });
        }),
    );
  });
});
