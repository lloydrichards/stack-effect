import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { PlanAssessor, type PlanningIntentPath } from "./PlanAssessor";

const makeJsxSlotPath = (contents?: string): PlanningIntentPath => ({
  path: "apps/web/src/App.tsx",
  contents,
  exports: [],
  dependencies: [],
  scripts: [],
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

describe("PlanAssessor package scripts", () => {
  it.effect(
    "keeps generated Deno FFI grants while merging an unrelated dependency",
    () =>
      Effect.gen(function* () {
        const assessor = yield* PlanAssessor;
        const path = "apps/server-api/package.json";
        const scripts = [
          {
            name: "dev",
            value:
              "deno run --allow-env --allow-net --allow-read --allow-write src/index.ts",
          },
          {
            name: "dev:watch",
            value:
              "deno run --watch --allow-env --allow-net --allow-read --allow-write src/index.ts",
          },
          {
            name: "build",
            value:
              "deno compile --allow-env --allow-net --allow-read --allow-write --output dist/cli-workflow src/index.ts",
          },
        ];
        const withFfi = scripts.map((entry) => ({
          ...entry,
          value: entry.value.replace(
            "--allow-write",
            "--allow-write --allow-ffi",
          ),
        }));
        const intent: PlanningIntentPath = {
          ...makeJsxSlotPath(),
          path,
          jsxSlots: [],
          scripts,
          dependencies: [
            { section: "dependencies", name: "@repo/db", value: "workspace:*" },
          ],
        };
        const snapshot = {
          _tag: "file" as const,
          path,
          contents: JSON.stringify({
            scripts: Object.fromEntries(
              withFfi.map(({ name, value }) => [name, value]),
            ),
          }),
        };
        const unchanged = {
          ...snapshot,
          contents: JSON.stringify({
            scripts: Object.fromEntries(
              scripts.map(({ name, value }) => [name, value]),
            ),
          }),
        };
        expect(
          assessor.preserveDenoSqlitePermissions(intent, unchanged).scripts,
        ).toEqual(scripts);

        const planningPath = assessor.preserveDenoSqlitePermissions(
          intent,
          snapshot,
        );
        const assessment = assessor.assessPlanningPath({
          planningPath,
          snapshotPath: snapshot,
        });
        expect(assessment).toEqual({ classification: "modify", conflicts: [] });
        expect(
          assessor.toPlannedFileOutcome({
            planningPath,
            classification: assessment.classification,
          }),
        ).toMatchObject({
          operations: [
            {
              _tag: "json-pkg-deps",
              entries: [{ name: "@repo/db", value: "workspace:*" }],
            },
            { _tag: "json-pkg-scripts", entries: withFfi },
          ],
        });

        const custom = {
          ...snapshot,
          contents: '{"scripts":{"dev":"deno run --allow-ffi custom.ts"}}',
        };
        const customPlan = assessor.preserveDenoSqlitePermissions(
          intent,
          custom,
        );
        expect(
          assessor.assessPlanningPath({
            planningPath: customPlan,
            snapshotPath: custom,
          }).conflicts,
        ).toEqual([{ _tag: "scripts", path, name: "dev" }]);
      }).pipe(Effect.provide(PlanAssessor.layer)),
  );
});
