import { defaultsForRuntime } from "@repo/scaffold/StackConfigDefaults";
import { describe, expect, it } from "vitest";

const defaults = {
  name: "example",
  runtime: { _tag: "bun" as const },
  typescript: "7" as const,
  monorepo: "vite-plus",
  lint: "oxlint",
  format: "oxfmt",
  test: "vitest",
};

describe("runtime defaults", () => {
  it("keeps the configured defaults for Bun and Node", () => {
    for (const runtime of ["bun", "node"] as const) {
      expect(defaultsForRuntime(defaults, runtime)).toEqual({
        typescript: "7",
        monorepo: "vite-plus",
        lint: "oxlint",
        format: "oxfmt",
        test: "vitest",
      });
    }
  });

  it("uses Deno defaults without copying unrelated configuration fields", () => {
    expect(defaultsForRuntime(defaults, "deno")).toEqual({
      typescript: "6",
      monorepo: undefined,
      lint: undefined,
      format: undefined,
      test: "vitest",
    });
  });
});
