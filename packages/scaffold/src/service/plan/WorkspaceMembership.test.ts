import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { registerWorkspaceMembers } from "./WorkspaceMembership";

for (const [path, previous, proposed] of [
  [
    "deno.json",
    '{"workspace":[],"custom":"old"}',
    '{"workspace":[],"custom":"new"}',
  ],
  [
    "pnpm-workspace.yaml",
    "packages: []\nsetting: old\n",
    "packages: []\nsetting: new\n",
  ],
] as const) {
  it.effect(
    `should preserve the proposed conflict when membership changes in ${path}`,
    () =>
      Effect.gen(function* () {
        const [outcome] = yield* registerWorkspaceMembers(
          [
            {
              _tag: "complete",
              path,
              contents: proposed,
              classification: "conflict",
            },
          ],
          { paths: [{ _tag: "file", path, contents: previous }] },
          ["packages/sdk/client"],
        );
        assert(outcome?._tag === "complete");
        assert.strictEqual(outcome.classification, "conflict");
        assert.include(outcome.contents, "packages/sdk/client");
        assert.include(outcome.contents, "new");
        assert.notInclude(outcome.contents, "old");
      }),
  );
}
