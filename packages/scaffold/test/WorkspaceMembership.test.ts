import { assert, it } from "@effect/vitest";
import { RepositoryPath } from "@repo/domain/Plan";
import { Effect } from "effect";
// oxlint-disable-next-line no-restricted-imports -- TODO: exercise through public modules once tests stop stubbing internals.
import { registerWorkspaceMembers } from "../src/internal/workspaceMembership";

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
              path: RepositoryPath.make(path),
              contents: proposed,
              classification: "conflict",
            },
          ],
          {
            paths: [
              {
                _tag: "file",
                path: RepositoryPath.make(path),
                contents: previous,
              },
            ],
          },
          [RepositoryPath.make("packages/sdk/client")],
        );
        assert(outcome?._tag === "complete");
        assert.strictEqual(outcome.classification, "conflict");
        assert.include(outcome.contents, "packages/sdk/client");
        assert.include(outcome.contents, "new");
        assert.notInclude(outcome.contents, "old");
      }),
  );
}
