import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { PlanAssessor, type PlanningIntentPath } from "./PlanAssessor";

const makeJsxSlotPath = (
  contents: string | undefined = undefined,
): PlanningIntentPath => ({
  path: "apps/web/src/App.tsx",
  contents,
  exports: [],
  dependencies: [],
  scripts: [],
  barrelExports: [],
  compositions: [],
  objectFields: [],
  workspaceEntries: [],
  jsxSlots: [
    {
      slotId: "components",
      content: "<Card />",
      import: undefined,
    },
  ],
  tsconfig: undefined,
});

const makeWorkspacePath = (fileType: "json" | "yaml"): PlanningIntentPath => ({
  path: fileType === "json" ? "package.json" : "pnpm-workspace.yaml",
  contents: undefined,
  exports: [],
  dependencies: [],
  scripts: [],
  barrelExports: [],
  compositions: [],
  objectFields: [],
  jsxSlots: [],
  workspaceEntries: [
    {
      fileType,
      key: fileType === "json" ? "workspaces" : "packages",
      value: "packages/*/*",
    },
  ],
  tsconfig: undefined,
});

const makeCombinedRootJsonPath = (): PlanningIntentPath => ({
  path: "package.json",
  contents: '{"name":"root","private":true,"workspaces":["apps/*"]}\n',
  exports: [],
  dependencies: [
    {
      section: "dependencies",
      name: "effect",
      value: "^4.0.0",
    },
  ],
  scripts: [{ name: "test", value: "vitest run" }],
  barrelExports: [],
  compositions: [],
  objectFields: [],
  jsxSlots: [],
  workspaceEntries: [
    {
      fileType: "json",
      key: "workspaces",
      value: "packages/*/*",
    },
  ],
  tsconfig: undefined,
});

describe("PlanAssessor combined root JSON", () => {
  it.effect(
    "creates a missing file with deterministic seed and operation order",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const planningPath = makeCombinedRootJsonPath();
        const assessment = assessor.assessPlanningPath({
          planningPath,
          snapshotPath: { _tag: "missing", path: planningPath.path },
        });

        expect(assessment).toEqual({ classification: "create", conflicts: [] });
        expect(
          assessor.toPlannedFileOutcome({
            planningPath,
            classification: assessment.classification,
          }),
        ).toEqual({
          _tag: "composed",
          path: "package.json",
          classification: "create",
          seedContents: planningPath.contents,
          operations: [
            {
              _tag: "json-pkg-deps",
              fileType: "json",
              section: "dependencies",
              entries: [{ name: "effect", value: "^4.0.0" }],
            },
            {
              _tag: "json-pkg-scripts",
              fileType: "json",
              entries: [{ name: "test", value: "vitest run" }],
            },
            {
              _tag: "json-array-entry",
              fileType: "json",
              field: "workspaces",
              value: "packages/*/*",
            },
          ],
        });
      }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect(
    "modifies additions and leaves a compatible complete file unchanged",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const planningPath = makeCombinedRootJsonPath();
        const assess = (contents: string) =>
          assessor.assessPlanningPath({
            planningPath,
            snapshotPath: { _tag: "file", path: planningPath.path, contents },
          });

        expect(assess(planningPath.contents!)).toEqual({
          classification: "modify",
          conflicts: [],
        });
        expect(
          assess(
            '{"name":"root","private":true,"workspaces":["apps/*","packages/*/*"],"dependencies":{"effect":"^4.0.0"},"scripts":{"test":"vitest run"}}\n',
          ),
        ).toEqual({ classification: "unchanged", conflicts: [] });
      }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect("reports all relevant package and workspace conflicts", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const planningPath = makeCombinedRootJsonPath();

      expect(
        assessor.assessPlanningPath({
          planningPath,
          snapshotPath: {
            _tag: "file",
            path: planningPath.path,
            contents:
              '{"dependencies":{"effect":"^3.0.0"},"scripts":{"test":"jest"},"workspaces":"packages/*"}\n',
          },
        }),
      ).toEqual({
        classification: "conflict",
        conflicts: [
          {
            _tag: "dependencies",
            path: "package.json",
            section: "dependencies",
            name: "effect",
          },
          { _tag: "scripts", path: "package.json", name: "test" },
          { _tag: "completeFile", path: "package.json" },
        ],
      });
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );
});

describe("PlanAssessor workspace sequence entries", () => {
  for (const fixture of [
    {
      fileType: "json" as const,
      existing: '{"workspaces":["apps/*","packages/*"]}\n',
      present: '{"workspaces":["apps/*","packages/*","packages/*/*"]}\n',
      malformed: '{"workspaces":"packages/*"}\n',
    },
    {
      fileType: "yaml" as const,
      existing: 'packages:\n  - "apps/*"\n  - "packages/*"\n',
      present:
        'packages:\n  - "apps/*"\n  - "packages/*"\n  - "packages/*/*"\n',
      malformed: "packages: apps/*\n",
    },
  ]) {
    it.effect(
      `assesses ${fixture.fileType} new, existing, no-op, and malformed intents without apply policy`,
      () =>
        Effect.gen(function* () {
          const assessor = yield* PlanAssessor;
          const path = makeWorkspacePath(fixture.fileType);
          const assess = (
            snapshotPath: Parameters<
              typeof assessor.assessPlanningPath
            >[0]["snapshotPath"],
          ) =>
            assessor.assessPlanningPath({ planningPath: path, snapshotPath });

          expect(assess({ _tag: "missing", path: path.path })).toEqual({
            classification: "create",
            conflicts: [],
          });
          expect(
            assess({
              _tag: "file",
              path: path.path,
              contents: fixture.existing,
            }),
          ).toEqual({ classification: "modify", conflicts: [] });
          expect(
            assess({
              _tag: "file",
              path: path.path,
              contents: fixture.present,
            }),
          ).toEqual({ classification: "unchanged", conflicts: [] });
          expect(
            assess({
              _tag: "file",
              path: path.path,
              contents: fixture.malformed,
            }),
          ).toEqual({
            classification: "conflict",
            conflicts: [{ _tag: "completeFile", path: path.path }],
          });
        }).pipe(Effect.provide(PlanAssessor.layer)),
    );
  }
});

describe("PlanAssessor JSX slots", () => {
  it.effect("plans a JSX-slot-only contribution to an existing target", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const assessment = assessor.assessPlanningPath({
        planningPath: makeJsxSlotPath(),
        snapshotPath: {
          _tag: "file",
          path: "apps/web/src/App.tsx",
          contents:
            "export const App = () => <>\n{/* @slot:components */}\n</>;\n",
        },
      });

      expect(assessment).toEqual({
        classification: "modify",
        conflicts: [],
      });
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect("reports the slot when a JSX-only target file is missing", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const assessment = assessor.assessPlanningPath({
        planningPath: makeJsxSlotPath(),
        snapshotPath: {
          _tag: "missing",
          path: "apps/web/src/App.tsx",
        },
      });

      expect(assessment).toEqual({
        classification: "conflict",
        conflicts: [
          {
            _tag: "jsxSlotTargetNotFound",
            path: "apps/web/src/App.tsx",
            slotId: "components",
          },
        ],
      });
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect("reports an existing file without the exact JSX slot marker", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const assessment = assessor.assessPlanningPath({
        planningPath: makeJsxSlotPath(),
        snapshotPath: {
          _tag: "file",
          path: "apps/web/src/App.tsx",
          contents: "export const App = () => <></>;\n",
        },
      });

      expect(assessment.conflicts).toEqual([
        {
          _tag: "jsxSlotTargetNotFound",
          path: "apps/web/src/App.tsx",
          slotId: "components",
        },
      ]);
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect("does not accept marker text outside a JSX expression", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const assessment = assessor.assessPlanningPath({
        planningPath: makeJsxSlotPath(),
        snapshotPath: {
          _tag: "file",
          path: "apps/web/src/App.tsx",
          contents: `const misleading = "{/* @slot:components */}";
export const App = () => <main />;
`,
        },
      });

      expect(assessment).toEqual({
        classification: "conflict",
        conflicts: [
          {
            _tag: "jsxSlotTargetNotFound",
            path: "apps/web/src/App.tsx",
            slotId: "components",
          },
        ],
      });
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect("keeps authoritative seeded creation valid", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const assessment = assessor.assessPlanningPath({
        planningPath: makeJsxSlotPath(
          "export const App = () => <>\n{/* @slot:components */}\n</>;\n",
        ),
        snapshotPath: {
          _tag: "missing",
          path: "apps/web/src/App.tsx",
        },
      });

      expect(assessment).toEqual({
        classification: "create",
        conflicts: [],
      });
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );

  it.effect(
    "reports a missing marker in an existing authoritative target",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const assessment = assessor.assessPlanningPath({
          planningPath: makeJsxSlotPath(
            "export const App = () => <>\n{/* @slot:components */}\n</>;\n",
          ),
          snapshotPath: {
            _tag: "file",
            path: "apps/web/src/App.tsx",
            contents: "export const App = () => <></>;\n",
          },
        });

        expect(assessment.classification).toBe("conflict");
        expect(assessment.conflicts).toHaveLength(1);
      }).pipe(Effect.provide(PlanAssessor.layer)),
  );
});
