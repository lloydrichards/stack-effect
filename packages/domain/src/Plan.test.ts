import { Plan, PlanEntryClassification } from "@repo/domain/Plan";
import { Schema } from "effect";
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
    const outcome = Schema.decodeUnknownSync(Plan.fields.outcomes.schema)({
      _tag: "authoritative",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      contents: '{"extends":"../../packages/config-typescript/base.json"}',
    });

    expect(outcome._tag).toBe("authoritative");
  });

  it("allows conflicts to be decoded independently", () => {
    const conflict = Schema.decodeUnknownSync(Plan.fields.conflicts.schema)({
      _tag: "authoritativeFile",
      path: "package.json",
    });

    expect(conflict._tag).toBe("authoritativeFile");
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
