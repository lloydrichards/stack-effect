import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as PlanAssessment from "./PlanAssessment";
import { PlanningIntentPath } from "./PlanAssessment";

const makeJsxSlotPath = (seed?: string) =>
  PlanningIntentPath.cases.jsxSlot.make({
    path: "apps/web/src/App.tsx",
    seed,
    jsxSlots: [
      {
        slotId: "components",
        content: "<Card />",
        import: undefined,
      },
    ],
  });

describe("PlanAssessment JSX slots", () => {
  it.effect("plans a JSX-slot-only contribution to an existing target", () =>
    Effect.gen(function* () {
      const assessment = yield* PlanAssessment.assess({
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
    }),
  );

  it.effect("reports the slot when a JSX-only target file is missing", () =>
    Effect.gen(function* () {
      const assessment = yield* PlanAssessment.assess({
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
    }),
  );

  it.effect("reports an existing file without the exact JSX slot marker", () =>
    Effect.gen(function* () {
      const assessment = yield* PlanAssessment.assess({
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
    }),
  );

  it.effect("does not accept marker text outside a JSX expression", () =>
    Effect.gen(function* () {
      const assessment = yield* PlanAssessment.assess({
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
    }),
  );

  it.effect("keeps authoritative seeded creation valid", () =>
    Effect.gen(function* () {
      const assessment = yield* PlanAssessment.assess({
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
    }),
  );

  it.effect(
    "reports a missing marker in an existing authoritative target",
    () =>
      Effect.gen(function* () {
        const assessment = yield* PlanAssessment.assess({
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
      }),
  );
});

describe("PlanAssessment package scripts", () => {
  it.effect(
    "keeps generated Deno FFI grants while merging an unrelated dependency",
    () =>
      Effect.gen(function* () {
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
        const intent = PlanningIntentPath.cases.packageJson.make({
          path,
          seed: undefined,
          exports: [],
          dependencies: [
            { section: "dependencies", name: "@repo/db", value: "workspace:*" },
          ],
          scripts,
        });
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
          PlanAssessment.preserveDenoSqlitePermissions(intent, unchanged),
        ).toEqual(intent);

        const planningPath = PlanAssessment.preserveDenoSqlitePermissions(
          intent,
          snapshot,
        );
        const assessment = yield* PlanAssessment.assess({
          planningPath,
          snapshotPath: snapshot,
        });
        expect(assessment).toEqual({ classification: "modify", conflicts: [] });
        expect(
          PlanAssessment.toPlannedFileOutcome({
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
        const customPlan = PlanAssessment.preserveDenoSqlitePermissions(
          intent,
          custom,
        );
        const customAssessment = yield* PlanAssessment.assess({
          planningPath: customPlan,
          snapshotPath: custom,
        });
        expect(customAssessment.conflicts).toEqual([
          { _tag: "scripts", path, name: "dev" },
        ]);
      }),
  );
});

describe("PlanAssessment authoritative contents", () => {
  const path = "packages/domain/tsconfig.json";
  const snapshotPath = { _tag: "file" as const, path, contents: "{}\n" };

  it.effect("conflicts instead of modifying a conflict-on-modify file", () =>
    Effect.gen(function* () {
      const assessment = yield* PlanAssessment.assess({
        planningPath: PlanningIntentPath.cases.conflictOnModify.make({
          path,
          contents: '{ "extends": "../../tsconfig.base.json" }\n',
        }),
        snapshotPath,
      });

      expect(assessment).toEqual({
        classification: "conflict",
        conflicts: [{ _tag: "tsconfig", path }],
      });
    }),
  );

  it.effect("fails when the planned file path is a directory", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        PlanAssessment.assess({
          planningPath: PlanningIntentPath.cases.authoritative.make({
            path,
            contents: "{}\n",
          }),
          snapshotPath: { _tag: "directory", path },
        }),
      );

      expect(failure.message).toBe(
        `Expected ${path} to be a file during planning.`,
      );
    }),
  );
});
