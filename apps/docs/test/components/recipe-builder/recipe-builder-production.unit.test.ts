import { describe, expect, it } from "vitest";
import source from "../../../app/components/recipe-builder/recipe-builder.tsx?raw";

describe("RecipeBuilder production diagnostics", () => {
  it("renders ResolutionPreview only in development", () => {
    expect(source).toContain(
      "{import.meta.env.DEV ? <ResolutionPreview /> : null}",
    );
    expect(source).not.toMatch(/^\s*<ResolutionPreview \/>\s*$/mu);
  });
});
