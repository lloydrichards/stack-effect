import {
  Apply,
  ApplyFailure,
  ApplyResult,
  StalePlanFailure,
} from "@repo/domain/Apply";
import { RepositoryPath } from "@repo/domain/Plan";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

describe("@repo/domain Apply", () => {
  const decodeApply = Schema.decodeUnknownSync(Apply);
  const emptyPlan = {
    baseline: { root: "/workspace", paths: [] },
    outcomes: [],
    conflicts: [],
  };

  it("accepts supported apply decision values", () => {
    const apply = decodeApply({
      plan: emptyPlan,
      decisions: [
        { path: "packages/domain/package.json", value: "override" },
        { path: "package.json", value: "skip" },
      ],
    });

    expect(apply.decisions).toEqual([
      { path: "packages/domain/package.json", value: "override" },
      { path: "package.json", value: "skip" },
    ]);
  });

  it("rejects unsupported apply decision values", () => {
    expect(() =>
      decodeApply({
        plan: emptyPlan,
        decisions: [{ path: "package.json", value: "merge" }],
      }),
    ).toThrow();
  });

  it("sorts apply result paths deterministically", () => {
    const result = new ApplyResult({
      created: [
        RepositoryPath.make("packages/domain/src/Api.ts"),
        RepositoryPath.make("README.md"),
      ],
      modified: [
        RepositoryPath.make("packages/domain/package.json"),
        RepositoryPath.make("apps/server-api/package.json"),
      ],
      skipped: [
        RepositoryPath.make("packages/domain/src/index.ts"),
        RepositoryPath.make("package.json"),
      ],
      failed: [
        {
          path: RepositoryPath.make("packages/domain/src/index.ts"),
          reason: "could not write file",
        },
        {
          path: RepositoryPath.make("README.md"),
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
    const error = Schema.decodeSync(ApplyFailure)({
      _tag: "ApplyFailure",
      message: "Missing decision for packages/domain/package.json",
    });

    expect(error._tag).toBe("ApplyFailure");
    expect(error.message).toBe(
      "Missing decision for packages/domain/package.json",
    );
  });

  it("decodes stale Plan failures with a partial result and no file contents", () => {
    const error = Schema.decodeSync(StalePlanFailure)({
      _tag: "StalePlanFailure",
      message: "The repository changed after planning",
      changes: [{ path: "README.md", kind: "modified" }],
      partialResult: {
        created: ["package.json"],
        modified: [],
        skipped: [],
        failed: [],
      },
    });

    expect(error.changes).toEqual([{ path: "README.md", kind: "modified" }]);
    expect(error.partialResult.created).toEqual(["package.json"]);
  });
});
