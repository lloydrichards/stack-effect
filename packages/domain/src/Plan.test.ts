import { Plan, PlanConflict, PlanEntryClassification } from "@repo/domain/Plan";
import { Schema, String } from "effect";
import { describe, expect, it } from "vitest";

describe("@repo/domain Plan", () => {
  it("accepts the supported plan classifications", () => {
    expect(Schema.decodeUnknownSync(PlanEntryClassification)("create")).toBe(
      "create",
    );
    expect(Schema.decodeUnknownSync(PlanEntryClassification)("modify")).toBe(
      "modify",
    );
    expect(Schema.decodeUnknownSync(PlanEntryClassification)("unchanged")).toBe(
      "unchanged",
    );
    expect(
      Schema.decodeUnknownSync(PlanEntryClassification)("needsMergeStrategy"),
    ).toBe("needsMergeStrategy");
  });

  it("rejects unsupported classifications", () => {
    expect(() =>
      Schema.decodeUnknownSync(PlanEntryClassification)("delete"),
    ).toThrow();
  });

  it("models a deterministic narrow public plan", () => {
    const plan = new Plan({
      entries: [
        {
          _tag: "directory",
          path: "packages/domain",
        },
        {
          _tag: "file",
          path: "packages/domain/src/Api.ts",
          classification: "create",
        },
      ],
      tree: {
        _tag: "directory",
        name: ".",
        path: ".",
        children: [
          {
            _tag: "directory",
            name: "packages",
            path: "packages",
            children: [
              {
                _tag: "directory",
                name: "domain",
                path: "packages/domain",
                children: [
                  {
                    _tag: "file",
                    name: "package.json",
                    path: "packages/domain/package.json",
                    classification: "modify",
                  },
                  {
                    _tag: "file",
                    name: "Api.ts",
                    path: "packages/domain/src/Api.ts",
                    classification: "create",
                  },
                ],
              },
            ],
          },
        ],
      },
      conflicts: [
        {
          _tag: "packageJsonExports",
          path: "packages/domain/package.json",
          exportKey: "./Api",
        },
      ],
    });

    expect(plan.entries.map((entry) => entry.path)).toStrictEqual([
      "packages/domain",
      "packages/domain/src/Api.ts",
    ]);
    expect(plan.tree.children).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("allows conflicts to be decoded independently", () => {
    const conflict = Schema.decodeUnknownSync(PlanConflict)({
      _tag: "authoritativeFile",
      path: "package.json",
    });

    expect(conflict._tag).toBe("authoritativeFile");
  });

  it("pretty prints an empty plan", () => {
    const plan = new Plan({
      entries: [],
      tree: {
        _tag: "directory",
        name: ".",
        path: ".",
        children: [],
      },
      conflicts: [],
    });

    expect(plan.prettyPrint()).toBe(
      String.stripMargin(`|Plan
       |
       |Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge
       |
       |Summary: 0 create  0 modify  0 unchanged  0 merge
       |
       |.`),
    );
  });

  it("pretty prints a plan with create, modify, unchanged, and merge conflicts", () => {
    const plan = new Plan({
      entries: [
        {
          _tag: "file",
          path: "packages/domain/src/Api.ts",
          classification: "create",
        },
        {
          _tag: "file",
          path: "packages/domain/src/index.ts",
          classification: "needsMergeStrategy",
        },
        {
          _tag: "file",
          path: "packages/domain/tsconfig.json",
          classification: "needsMergeStrategy",
        },
        {
          _tag: "file",
          path: "README.md",
          classification: "modify",
        },
        {
          _tag: "file",
          path: "package.json",
          classification: "unchanged",
        },
      ],
      tree: {
        _tag: "directory",
        name: ".",
        path: ".",
        children: [
          {
            _tag: "directory",
            name: "packages",
            path: "packages",
            children: [
              {
                _tag: "directory",
                name: "domain",
                path: "packages/domain",
                children: [
                  {
                    _tag: "file",
                    name: "tsconfig.json",
                    path: "packages/domain/tsconfig.json",
                    classification: "needsMergeStrategy",
                  },
                  {
                    _tag: "directory",
                    name: "src",
                    path: "packages/domain/src",
                    children: [
                      {
                        _tag: "file",
                        name: "Api.ts",
                        path: "packages/domain/src/Api.ts",
                        classification: "create",
                      },
                      {
                        _tag: "file",
                        name: "index.ts",
                        path: "packages/domain/src/index.ts",
                        classification: "needsMergeStrategy",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            _tag: "file",
            name: "README.md",
            path: "README.md",
            classification: "modify",
          },
          {
            _tag: "file",
            name: "package.json",
            path: "package.json",
            classification: "unchanged",
          },
        ],
      },
      conflicts: [
        {
          _tag: "barrelExport",
          path: "packages/domain/src/index.ts",
          exportPath: "./Api",
        },
        {
          _tag: "tsconfig",
          path: "packages/domain/tsconfig.json",
        },
      ],
    }).toSorted();

    expect(plan.prettyPrint()).toBe(
      String.stripMargin(`|Plan
       |
       |Legend: [+] create  [~] modify  [=] unchanged  [!] needs merge
       |
       |Summary: 1 create  1 modify  1 unchanged  2 merge
       |
       |.
       |├── packages
       |│   └── domain
       |│       ├── src
       |│       │   ├── [+] Api.ts
       |│       │   └── [!] index.ts
       |│       │       merge: export ./Api
       |│       └── [!] tsconfig.json
       |│           merge: tsconfig
       |├── [~] README.md
       |└── [=] package.json`),
    );
  });

  it("sorts plan entries, tree children, and conflicts deterministically", () => {
    const plan = new Plan({
      entries: [
        {
          _tag: "file",
          path: "packages/domain/src/Api.ts",
          classification: "create",
        },
        {
          _tag: "directory",
          path: "packages/domain",
        },
      ],
      tree: {
        _tag: "directory",
        name: ".",
        path: ".",
        children: [
          {
            _tag: "file",
            name: "README.md",
            path: "README.md",
            classification: "modify",
          },
          {
            _tag: "directory",
            name: "packages",
            path: "packages",
            children: [],
          },
        ],
      },
      conflicts: [
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

    expect(plan.entries.map((entry) => entry.path)).toEqual([
      "packages/domain",
      "packages/domain/src/Api.ts",
    ]);
    expect(plan.tree.children.map((child) => child.path)).toEqual([
      "packages",
      "README.md",
    ]);
    expect(plan.conflicts.map((conflict) => conflict.path)).toEqual([
      "packages/domain/src/index.ts",
      "packages/domain/tsconfig.json",
    ]);
  });
});
