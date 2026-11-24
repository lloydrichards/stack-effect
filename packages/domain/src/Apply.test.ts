import { assert, describe, it } from "@effect/vitest";
import {
  Apply,
  ApplyFailure,
  ApplyResult,
  StalePlanFailure,
} from "@repo/domain/Apply";
import { RepositoryPath } from "@repo/domain/Plan";
import { Schema } from "effect";

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

    assert.deepStrictEqual(apply.decisions, [
      {
        path: RepositoryPath.make("packages/domain/package.json"),
        value: "override",
      },
      { path: RepositoryPath.make("package.json"), value: "skip" },
    ]);
  });

  it("rejects unsupported apply decision values", () => {
    assert.throws(() =>
      decodeApply({
        plan: emptyPlan,
        decisions: [{ path: "package.json", value: "merge" }],
      }),
    );
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

    assert.deepStrictEqual(result.created, [
      RepositoryPath.make("README.md"),
      RepositoryPath.make("packages/domain/src/Api.ts"),
    ]);
    assert.deepStrictEqual(result.modified, [
      RepositoryPath.make("apps/server-api/package.json"),
      RepositoryPath.make("packages/domain/package.json"),
    ]);
    assert.deepStrictEqual(result.skipped, [
      RepositoryPath.make("package.json"),
      RepositoryPath.make("packages/domain/src/index.ts"),
    ]);
    assert.deepStrictEqual(
      result.failed.map((failedPath) => failedPath.path),
      ["README.md", "packages/domain/src/index.ts"],
    );
  });

  it("decodes apply failures", () => {
    const error = Schema.decodeSync(ApplyFailure)({
      _tag: "ApplyFailure",
      message: "Missing decision for packages/domain/package.json",
    });

    assert.strictEqual(error._tag, "ApplyFailure");
    assert.strictEqual(
      error.message,
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

    assert.deepStrictEqual(error.changes, [
      { path: RepositoryPath.make("README.md"), kind: "modified" },
    ]);
    assert.deepStrictEqual(error.partialResult.created, [
      RepositoryPath.make("package.json"),
    ]);
  });
});
