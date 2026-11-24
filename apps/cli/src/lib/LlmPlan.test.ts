import { assert, describe, it } from "@effect/vitest";
import { RepositoryPath } from "@repo/domain/Plan";
import * as LlmPlan from "./LlmPlan";

describe("LlmPlan.render", () => {
  it("renders a missing JSX slot with its path and slot id", () => {
    const rendered = LlmPlan.render({
      outcomes: [],
      conflicts: [
        {
          _tag: "jsxSlotTargetNotFound",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          slotId: "components",
        },
      ],
      summary: {
        total: 1,
        create: 0,
        modify: 0,
        unchanged: 0,
        conflict: 1,
      },
      tree: "",
    });

    assert.deepStrictEqual(rendered.conflicts, [
      {
        path: "apps/web/src/App.tsx",
        kind: "jsx-slot-target-not-found",
        description:
          "Cannot find JSX slot `@slot:components` in apps/web/src/App.tsx; add the content manually",
      },
    ]);
  });
});
