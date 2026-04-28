import {
  Apply,
  ApplyDecision,
  ApplyFailure,
  ApplyResult,
} from "@repo/domain/Apply";
import { Plan } from "@repo/domain/Plan";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

describe("@repo/domain Apply", () => {
  it("accepts supported apply decision values", () => {
    expect(
      Schema.decodeUnknownSync(ApplyDecision)({
        path: "package.json",
        value: "override",
      }),
    ).toMatchObject({ value: "override" });
    expect(
      Schema.decodeUnknownSync(ApplyDecision)({
        path: "package.json",
        value: "skip",
      }),
    ).toMatchObject({ value: "skip" });
  });

  it("rejects unsupported apply decision values", () => {
    expect(() =>
      Schema.decodeUnknownSync(ApplyDecision)({
        path: "package.json",
        value: "merge",
      }),
    ).toThrow();
  });

  it("decodes apply decisions independently", () => {
    const decision = Schema.decodeUnknownSync(ApplyDecision)({
      path: "packages/domain/package.json",
      value: "override",
    });

    expect(decision).toEqual({
      path: "packages/domain/package.json",
      value: "override",
    });
  });

  it("sorts apply decisions deterministically", () => {
    const apply = new Apply({
      plan: new Plan({
        outcomes: [],
        conflicts: [],
      }),
      decisions: [
        {
          path: "packages/domain/src/index.ts",
          value: "skip",
        },
        {
          path: "README.md",
          value: "override",
        },
      ],
    }).toSorted();

    expect(apply.decisions.map((decision) => decision.path)).toEqual([
      "README.md",
      "packages/domain/src/index.ts",
    ]);
  });

  it("sorts apply result paths deterministically", () => {
    const result = new ApplyResult({
      created: ["packages/domain/src/Api.ts", "README.md"],
      modified: [
        "packages/domain/package.json",
        "apps/server-api/package.json",
      ],
      skipped: ["packages/domain/src/index.ts", "package.json"],
      failed: [
        {
          path: "packages/domain/src/index.ts",
          reason: "could not write file",
        },
        {
          path: "README.md",
          reason: "permission denied",
        },
      ],
    }).toSorted();

    expect(result.created).toEqual(["README.md", "packages/domain/src/Api.ts"]);
    expect(result.modified).toEqual([
      "apps/server-api/package.json",
      "packages/domain/package.json",
    ]);
    expect(result.skipped).toEqual([
      "package.json",
      "packages/domain/src/index.ts",
    ]);
    expect(result.failed.map((failedPath) => failedPath.path)).toEqual([
      "README.md",
      "packages/domain/src/index.ts",
    ]);
  });

  it("decodes apply failures", () => {
    const error = Schema.decodeUnknownSync(ApplyFailure)({
      _tag: "ApplyFailure",
      reason: "invalidApplyIntent",
      message: "Missing decision for packages/domain/package.json",
    });

    expect(error.reason).toBe("invalidApplyIntent");
  });
});
