import {
  Plan,
  PlanConflict,
  PlanEntryClassification,
  PlannedFileOutcome,
} from "@repo/domain/Plan";
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
      outcomes: [
        {
          _tag: "structural",
          path: "packages/domain/package.json",
          classification: "modify",
          requiredStructure: {
            packageJsonExports: [
              {
                exportKey: "./Api",
                exportValue: "./src/Api.ts",
              },
            ],
          },
        },
        {
          _tag: "authoritative",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
      ],
      conflicts: [
        {
          _tag: "packageJsonExports",
          path: "packages/domain/package.json",
          exportKey: "./Api",
        },
      ],
    });

    expect(plan.outcomes.map((outcome) => outcome.path)).toStrictEqual([
      "packages/domain/package.json",
      "packages/domain/src/Api.ts",
    ]);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("allows planned file outcomes to be decoded independently", () => {
    const outcome = Schema.decodeUnknownSync(PlannedFileOutcome)({
      _tag: "authoritative",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      contents: '{"extends":"../../packages/config-typescript/base.json"}',
    });

    expect(outcome._tag).toBe("authoritative");
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
      outcomes: [],
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
      outcomes: [
        {
          _tag: "authoritative",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
        {
          _tag: "structural",
          path: "packages/domain/src/index.ts",
          classification: "needsMergeStrategy",
          requiredStructure: { reExports: ["./Api"] },
        },
        {
          _tag: "authoritative",
          path: "packages/domain/tsconfig.json",
          classification: "needsMergeStrategy",
          contents: '{"extends":"../../packages/config-typescript/base.json"}',
        },
        {
          _tag: "authoritative",
          path: "README.md",
          classification: "modify",
          contents: "# Repo\n",
        },
        {
          _tag: "structural",
          path: "package.json",
          classification: "unchanged",
          requiredStructure: {
            packageJsonScripts: [
              { scriptName: "build", scriptValue: "tsc -p tsconfig.json" },
            ],
          },
        },
      ],
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
       |├── [=] package.json
       |└── [~] README.md`),
    );
  });

  it("sorts planned file outcomes and conflicts deterministically", () => {
    const plan = new Plan({
      outcomes: [
        {
          _tag: "authoritative",
          path: "packages/domain/src/Api.ts",
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
        {
          _tag: "authoritative",
          path: "README.md",
          classification: "modify",
          contents: "# Repo\n",
        },
      ],
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

    expect(plan.outcomes.map((outcome) => outcome.path)).toEqual([
      "README.md",
      "packages/domain/src/Api.ts",
    ]);
    expect(plan.conflicts.map((conflict) => conflict.path)).toEqual([
      "packages/domain/src/index.ts",
      "packages/domain/tsconfig.json",
    ]);
  });
});
