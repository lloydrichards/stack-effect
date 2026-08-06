import { describe, expect, it } from "@effect/vitest";
import { ApplyResult } from "@repo/domain/Apply";
import { Box } from "effect-boxes";
import { DryRunPreview } from "./DryRunPreview";

const input = {
  blueprint: Box.text("blueprint"),
  plan: {
    summary: "summary",
    tree: Box.text("tree"),
    legend: Box.text("legend"),
  },
  apply: new ApplyResult({
    created: ["apps/api.ts"],
    modified: ["package.json"],
    skipped: ["README.md"],
    failed: [],
  }),
  scripts: [],
};

describe("DryRunPreview", () => {
  it("keeps generated-file output absent unless requested", () => {
    const existingOutput = Box.renderPlainSync(DryRunPreview(input));
    const explicitUndefinedOutput = Box.renderPlainSync(
      DryRunPreview({ ...input, generatedFiles: undefined }),
    );

    expect(explicitUndefinedOutput).toBe(existingOutput);
    expect(existingOutput).not.toContain("Generated Files");
  });

  it("renders complete generated files in supplied path order", () => {
    const output = Box.renderPlainSync(
      DryRunPreview({
        ...input,
        generatedFiles: [
          {
            path: "apps/api.ts",
            status: "created",
            contents: "export const first = 1;\nexport const second = 2;\n",
          },
          {
            path: "package.json",
            status: "modified",
            contents: '{\n  "name": "preview"\n}\n',
          },
        ],
      }),
    );

    expect(output).toContain("Generated Files");
    expect(output).toContain("+ apps/api.ts");
    expect(output).toContain("~ package.json");
    expect(output).toContain("export const first = 1;");
    expect(output).toContain("export const second = 2;");
    expect(output).toContain('"name": "preview"');
    expect(output).not.toContain("README.md");
    expect(output.indexOf("apps/api.ts")).toBeLessThan(
      output.indexOf("package.json"),
    );
  });

  it("wraps long source lines without dropping their contents", () => {
    const longLine = "x".repeat(100);
    const output = Box.renderPlainSync(
      DryRunPreview({
        ...input,
        generatedFiles: [
          { path: "long.txt", status: "created", contents: longLine },
        ],
      }),
    );

    expect(output).toContain("x".repeat(70));
    expect(output).toContain("x".repeat(30));
    expect(
      Math.max(...output.split("\n").map((line) => line.length)),
    ).toBeLessThanOrEqual(80);
  });
});
