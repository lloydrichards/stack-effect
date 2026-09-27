import { Plan, PlanEntryClassification } from "@repo/domain/Plan";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

describe("@repo/domain Plan", () => {
  const baseline = { root: "/workspace", paths: [] } as const;
  it("should accept supported classifications and reject unsupported values", () => {
    expect(Schema.decodeSync(PlanEntryClassification)("create")).toBe("create");
    expect(Schema.decodeSync(PlanEntryClassification)("modify")).toBe("modify");
    expect(Schema.decodeSync(PlanEntryClassification)("unchanged")).toBe(
      "unchanged",
    );
    expect(Schema.decodeSync(PlanEntryClassification)("conflict")).toBe(
      "conflict",
    );
    expect(() =>
      Schema.decodeUnknownSync(PlanEntryClassification)("delete"),
    ).toThrow();
  });

  it("should decode outcome and conflict fields independently", () => {
    const outcome = Schema.decodeSync(Plan.fields.outcomes.value)({
      _tag: "complete",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      contents: '{"extends":"../../packages/config-typescript/base.json"}',
    });

    expect(outcome._tag).toBe("complete");
    const conflict = Schema.decodeSync(Plan.fields.conflicts.value)({
      _tag: "completeFile",
      path: "package.json",
    });

    expect(conflict._tag).toBe("completeFile");
  });

  it("should sort outcomes and distinct same-path diagnostics deterministically", () => {
    const plan = new Plan({
      baseline: {
        root: "/workspace",
        paths: [
          { _tag: "missing", path: "z.txt" },
          { _tag: "file", path: "a.txt", sha256: "abc" },
        ],
      },
      outcomes: [
        {
          _tag: "complete",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
        {
          _tag: "complete",
          path: "apps/web/src/App.tsx",
          classification: "conflict",
          contents: "export const App = () => null;\n",
        },
        {
          _tag: "complete",
          path: "packages/domain/tsconfig.json",
          classification: "conflict",
          contents: "{}\n",
        },
        {
          _tag: "complete",
          path: "packages/domain/src/index.ts",
          classification: "conflict",
          contents: "export {};\n",
        },
      ],
      conflicts: [
        {
          _tag: "jsxSlotTargetNotFound",
          path: "apps/web/src/App.tsx",
          slotId: "footer",
        },
        {
          _tag: "jsxSlotTargetNotFound",
          path: "apps/web/src/App.tsx",
          slotId: "components",
        },
        {
          _tag: "tsconfig",
          path: "packages/domain/tsconfig.json",
        },
        {
          _tag: "barrelExport",
          path: "packages/domain/src/index.ts",
          exportPath: "./Api",
        },
      ],
    }).toSorted();

    expect(plan.outcomes.map((outcome) => outcome.path)).toEqual([
      "apps/web/src/App.tsx",
      "packages/domain/src/Api.ts",
      "packages/domain/src/index.ts",
      "packages/domain/tsconfig.json",
    ]);
    expect(plan.baseline.paths.map((entry) => entry.path)).toEqual([
      "a.txt",
      "z.txt",
    ]);
    expect(plan.conflicts.map((conflict) => conflict.path)).toEqual([
      "packages/domain/src/index.ts",
      "apps/web/src/App.tsx",
      "apps/web/src/App.tsx",
      "packages/domain/tsconfig.json",
    ]);
    expect(plan.conflicts.slice(1, 3)).toEqual([
      {
        _tag: "jsxSlotTargetNotFound",
        path: "apps/web/src/App.tsx",
        slotId: "components",
      },
      {
        _tag: "jsxSlotTargetNotFound",
        path: "apps/web/src/App.tsx",
        slotId: "footer",
      },
    ]);
  });

  const invalidPlans: ReadonlyArray<{
    readonly name: string;
    readonly construct: () => Plan;
  }> = [
    {
      name: "duplicate baseline paths",
      construct: () =>
        new Plan({
          baseline: {
            root: "/workspace",
            paths: [
              { _tag: "missing", path: "README.md" },
              { _tag: "directory", path: "README.md" },
            ],
          },
          outcomes: [],
          conflicts: [],
        }),
    },
    {
      name: "duplicate outcome paths",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: "README.md",
              classification: "create",
              contents: "# Repo\n",
            },
            {
              _tag: "complete",
              path: "README.md",
              classification: "modify",
              contents: "# Updated\n",
            },
          ],
          conflicts: [],
        }),
    },
    {
      name: "duplicate exact conflict diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: "package.json",
              classification: "conflict",
              contents: "{}\n",
            },
          ],
          conflicts: [
            { _tag: "scripts", path: "package.json", name: "test" },
            { _tag: "scripts", path: "package.json", name: "test" },
          ],
        }),
    },
    {
      name: "orphan conflict diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [],
          conflicts: [{ _tag: "completeFile", path: "README.md" }],
        }),
    },
    {
      name: "conflicted outcomes without diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: "README.md",
              classification: "conflict",
              contents: "# Repo\n",
            },
          ],
          conflicts: [],
        }),
    },
  ];

  it("should reject invalid relationships during checked construction", () => {
    invalidPlans.forEach(({ construct, name }) => {
      expect(construct, name).toThrow();
    });
  });

  it("should reject invalid relationships when decoding", () => {
    expect(() =>
      Schema.decodeSync(Plan)({
        baseline,
        outcomes: [],
        conflicts: [{ _tag: "completeFile", path: "README.md" }],
      }),
    ).toThrow();
  });
});
