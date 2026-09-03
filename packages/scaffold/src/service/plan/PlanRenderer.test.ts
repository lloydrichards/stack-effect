import { describe, expect, it } from "vitest";
import { renderPlanForLlm } from "./PlanRenderer";

describe("renderPlanForLlm", () => {
  it("renders package script appends as explicit instructions", () => {
    const rendered = renderPlanForLlm({
      outcomes: [
        {
          _tag: "composed",
          path: "package.json",
          classification: "modify",
          operations: [
            {
              _tag: "json-pkg-scripts-append",
              fileType: "json",
              entries: [{ name: "prepare", fragment: "husky" }],
            },
          ],
        },
      ],
      conflicts: [],
      summary: { total: 1, create: 0, modify: 1, unchanged: 0, conflict: 0 },
      tree: "",
    });

    expect(rendered.files[0]?.instructions).toEqual([
      'In `package.json`, append these script fragments:\n  "prepare": append "husky"',
    ]);
  });

  it("renders a missing JSX slot with its path and slot id", () => {
    const rendered = renderPlanForLlm({
      outcomes: [],
      conflicts: [
        {
          _tag: "jsxSlotTargetNotFound",
          path: "apps/web/src/App.tsx",
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

    expect(rendered.conflicts).toEqual([
      {
        path: "apps/web/src/App.tsx",
        kind: "jsx-slot-target-not-found",
        description:
          "Cannot find JSX slot `@slot:components` in apps/web/src/App.tsx; add the content manually",
      },
    ]);
  });
});
