import { assert, describe, it } from "@effect/vitest";
import { Apply, ApplyResult } from "@repo/domain/Apply";
import { RepositoryPath } from "@repo/domain/Plan";
import { Schema } from "effect";

describe("@repo/domain Apply", () => {
  const decodeApply = Schema.decodeUnknownSync(Apply);
  const conflictedPaths = ["packages/domain/package.json", "package.json"];
  const conflictedPlan = {
    baseline: {
      root: "/workspace",
      paths: conflictedPaths.map((path) => ({
        _tag: "file",
        path,
        sha256: "",
      })),
    },
    outcomes: conflictedPaths.map((path) => ({
      _tag: "complete",
      path,
      classification: "conflict",
      contents: "{}",
    })),
    conflicts: conflictedPaths.map((path) => ({ _tag: "completeFile", path })),
  };

  it("should keep each decision when every conflicted path has exactly one supported decision", () => {
    const apply = decodeApply({
      plan: conflictedPlan,
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

  it.each([
    {
      name: "an unsupported value",
      decisions: [
        { path: "packages/domain/package.json", value: "override" },
        { path: "package.json", value: "merge" },
      ],
      message: 'Expected "override" | "skip"',
    },
    {
      name: "a conflict without a decision",
      decisions: [{ path: "packages/domain/package.json", value: "override" }],
      message: "Missing apply decision for conflicted path package.json.",
    },
    {
      name: "a repeated path",
      decisions: [
        { path: "packages/domain/package.json", value: "override" },
        { path: "package.json", value: "skip" },
        { path: "package.json", value: "override" },
      ],
      message: "Duplicate apply decision for package.json.",
    },
    {
      name: "a path without a conflict",
      decisions: [
        { path: "packages/domain/package.json", value: "override" },
        { path: "package.json", value: "skip" },
        { path: "README.md", value: "skip" },
      ],
      message: "Unexpected apply decision for non-conflicted path README.md.",
    },
  ])(
    "should reject the Apply when decisions contain $name",
    ({ decisions, message }) => {
      assert.throws(
        () => decodeApply({ plan: conflictedPlan, decisions }),
        message,
      );
    },
  );

  it("should order every result category by path when the result is sorted", () => {
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
          causes: [],
        },
        {
          path: RepositoryPath.make("README.md"),
          reason: "permission denied",
          causes: [],
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
});
