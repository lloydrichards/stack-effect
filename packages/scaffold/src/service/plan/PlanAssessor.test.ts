import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { PlanAssessor, type PlanningIntentPath } from "./PlanAssessor";

const makeScriptAppendPath = (): PlanningIntentPath => ({
  path: "package.json",
  contents: undefined,
  exports: [],
  dependencies: [],
  scripts: [],
  scriptAppends: [{ name: "prepare", fragment: "husky" }],
  barrelExports: [],
  compositions: [],
  objectFields: [],
  jsxSlots: [],
  tsconfig: undefined,
});

const makeJsxSlotPath = (
  contents: string | undefined = undefined,
): PlanningIntentPath => ({
  path: "apps/web/src/App.tsx",
  contents,
  exports: [],
  dependencies: [],
  scripts: [],
  scriptAppends: [],
  barrelExports: [],
  compositions: [],
  objectFields: [],
  jsxSlots: [
    {
      slotId: "components",
      content: "<Card />",
      import: undefined,
    },
  ],
  tsconfig: undefined,
});

describe("PlanAssessor package script appends", () => {
  it.effect("conflicts when an existing script is not a string", () =>
    Effect.gen(function* () {
      const assessor = yield* PlanAssessor;
      const assessment = assessor.assessPlanningPath({
        planningPath: makeScriptAppendPath(),
        snapshotPath: {
          _tag: "file",
          path: "package.json",
          contents: JSON.stringify({ scripts: { prepare: ["custom setup"] } }),
        },
      });

      expect(assessment).toEqual({
        classification: "conflict",
        conflicts: [{ _tag: "scripts", path: "package.json", name: "prepare" }],
      });
    }).pipe(Effect.provide(PlanAssessor.layer)),
  );
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
