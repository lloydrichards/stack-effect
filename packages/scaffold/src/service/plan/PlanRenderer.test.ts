import { describe, expect, it } from "vitest";
import { renderPlanForLlm } from "./PlanRenderer";

describe("renderPlanForLlm", () => {
  it("renders stable deterministic review text for JSON and YAML workspace entries", () => {
    const rendered = renderPlanForLlm({
      outcomes: [
        {
          _tag: "composed",
          path: "package.json",
          classification: "modify",
          operations: [
            {
              _tag: "json-array-entry",
              fileType: "json",
              field: "workspaces",
              value: "packages/*/*",
            },
          ],
        },
        {
          _tag: "composed",
          path: "pnpm-workspace.yaml",
          classification: "modify",
          operations: [
            {
              _tag: "yaml-sequence-entry",
              fileType: "yaml",
              key: "packages",
              value: "packages/*/*",
            },
          ],
        },
      ],
      conflicts: [],
      summary: { total: 2, create: 0, modify: 2, unchanged: 0, conflict: 0 },
      tree: "package.json\npnpm-workspace.yaml",
    });

    expect(
      rendered.files.map(({ path, classification, instructions }) => ({
        path,
        classification,
        instructions,
      })),
    ).toEqual([
      {
        path: "package.json",
        classification: "modify",
        instructions: [
          'In `package.json`, append `packages/*/*` to "workspaces"',
        ],
      },
      {
        path: "pnpm-workspace.yaml",
        classification: "modify",
        instructions: [
          'In `pnpm-workspace.yaml`, append `packages/*/*` to "packages"',
        ],
      },
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
