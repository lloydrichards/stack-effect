import { describe, expect, it } from "@effect/vitest";
import * as PlanAssessment from "./PlanAssessment";
import type { PlanningIntentPath } from "./PlanAssessment";

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

describe("PlanAssessment JSX slots", () => {
  it("plans a JSX-slot-only contribution to an existing target", () => {
    const assessment = PlanAssessment.assess({
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
  });

  it("reports the slot when a JSX-only target file is missing", () => {
    const assessment = PlanAssessment.assess({
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
  });

  it("reports an existing file without the exact JSX slot marker", () => {
    const assessment = PlanAssessment.assess({
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
  });

  it("does not accept marker text outside a JSX expression", () => {
    const assessment = PlanAssessment.assess({
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
  });

  it("keeps authoritative seeded creation valid", () => {
    const assessment = PlanAssessment.assess({
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
  });

  it("reports a missing marker in an existing authoritative target", () => {
    const assessment = PlanAssessment.assess({
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
  });
});

describe("PlanAssessment package scripts", () => {
  it("keeps generated Deno FFI grants while merging an unrelated dependency", () => {
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
      value: entry.value.replace("--allow-write", "--allow-write --allow-ffi"),
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
      PlanAssessment.preserveDenoSqlitePermissions(intent, unchanged).scripts,
    ).toEqual(scripts);

    const planningPath = PlanAssessment.preserveDenoSqlitePermissions(
      intent,
      snapshot,
    );
    const assessment = PlanAssessment.assess({
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
    expect(
      PlanAssessment.assess({
        planningPath: customPlan,
        snapshotPath: custom,
      }).conflicts,
    ).toEqual([{ _tag: "scripts", path, name: "dev" }]);
  });
});
