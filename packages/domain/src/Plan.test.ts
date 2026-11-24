import { assert, describe, it } from "@effect/vitest";
import { Plan, RepositoryPath } from "@repo/domain/Plan";
import { Schema } from "effect";

describe("@repo/domain Plan", () => {
  const baseline = { root: "/workspace", paths: [] } as const;
  it("should accept supported classifications and reject unsupported values", () => {
    const decodeOutcome = Schema.decodeUnknownSync(Plan.fields.outcomes.value);
    const outcome = (classification: string) => ({
      _tag: "complete",
      path: "package.json",
      classification,
      contents: "{}",
    });

    for (const classification of [
      "create",
      "modify",
      "unchanged",
      "conflict",
    ]) {
      assert.strictEqual(
        decodeOutcome(outcome(classification)).classification,
        classification,
      );
    }
    assert.throws(() => decodeOutcome(outcome("delete")));
  });

  it("should decode outcome and conflict fields independently", () => {
    const outcome = Schema.decodeSync(Plan.fields.outcomes.value)({
      _tag: "complete",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      contents: '{"extends":"../../packages/config-typescript/base.json"}',
    });

    assert.strictEqual(outcome._tag, "complete");
    const conflict = Schema.decodeSync(Plan.fields.conflicts.value)({
      _tag: "completeFile",
      path: "package.json",
    });

    assert.strictEqual(conflict._tag, "completeFile");
  });

  it("should sort outcomes and distinct same-path diagnostics deterministically", () => {
    const plan = new Plan({
      baseline: {
        root: "/workspace",
        paths: [
          { _tag: "missing", path: RepositoryPath.make("z.txt") },
          { _tag: "file", path: RepositoryPath.make("a.txt"), sha256: "abc" },
        ],
      },
      outcomes: [
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/src/Api.ts"),
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          classification: "conflict",
          contents: "export const App = () => null;\n",
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/tsconfig.json"),
          classification: "conflict",
          contents: "{}\n",
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/src/index.ts"),
          classification: "conflict",
          contents: "export {};\n",
        },
      ],
      conflicts: [
        {
          _tag: "jsxSlotTargetNotFound",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          slotId: "footer",
        },
        {
          _tag: "jsxSlotTargetNotFound",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          slotId: "components",
        },
        {
          _tag: "tsconfig",
          path: RepositoryPath.make("packages/domain/tsconfig.json"),
        },
        {
          _tag: "completeFile",
          path: RepositoryPath.make("packages/domain/src/index.ts"),
        },
      ],
    }).toSorted();

    assert.deepStrictEqual(
      plan.outcomes.map((outcome) => outcome.path),
      [
        "apps/web/src/App.tsx",
        "packages/domain/src/Api.ts",
        "packages/domain/src/index.ts",
        "packages/domain/tsconfig.json",
      ],
    );
    assert.deepStrictEqual(
      plan.baseline.paths.map((entry) => entry.path),
      ["a.txt", "z.txt"],
    );
    assert.deepStrictEqual(
      plan.conflicts.map((conflict) => conflict.path),
      [
        "packages/domain/src/index.ts",
        "apps/web/src/App.tsx",
        "apps/web/src/App.tsx",
        "packages/domain/tsconfig.json",
      ],
    );
    assert.deepStrictEqual(plan.conflicts.slice(1, 3), [
      {
        _tag: "jsxSlotTargetNotFound",
        path: RepositoryPath.make("apps/web/src/App.tsx"),
        slotId: "components",
      },
      {
        _tag: "jsxSlotTargetNotFound",
        path: RepositoryPath.make("apps/web/src/App.tsx"),
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
              { _tag: "missing", path: RepositoryPath.make("README.md") },
              { _tag: "directory", path: RepositoryPath.make("README.md") },
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
              path: RepositoryPath.make("README.md"),
              classification: "create",
              contents: "# Repo\n",
            },
            {
              _tag: "complete",
              path: RepositoryPath.make("README.md"),
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
              path: RepositoryPath.make("package.json"),
              classification: "conflict",
              contents: "{}\n",
            },
          ],
          conflicts: [
            {
              _tag: "scripts",
              path: RepositoryPath.make("package.json"),
              name: "test",
            },
            {
              _tag: "scripts",
              path: RepositoryPath.make("package.json"),
              name: "test",
            },
          ],
        }),
    },
    {
      name: "orphan conflict diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [],
          conflicts: [
            { _tag: "completeFile", path: RepositoryPath.make("README.md") },
          ],
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
              path: RepositoryPath.make("README.md"),
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
      assert.throws(construct, null, null, name);
    });
  });

  it("should reject invalid relationships when decoding", () => {
    assert.throws(() =>
      Schema.decodeSync(Plan)({
        baseline,
        outcomes: [],
        conflicts: [{ _tag: "completeFile", path: "README.md" }],
      }),
    );
  });
});
