import { describe, expect, it } from "vitest";
import { highlightSource, languageForPath } from "./syntax-highlighter";

describe("languageForPath", () => {
  it.each([
    ["apps/web/app.tsx", "tsx"],
    ["apps/web/index.html", "html"],
    ["apps/web/app.css", "css"],
    ["packages/domain/src/api.ts", "typescript"],
    ["stack.effect.json", "json"],
    ["tsconfig.jsonc", "jsonc"],
    ["bunfig.yaml", "yaml"],
    ["flake.nix", "nix"],
    [".envrc", "shellscript"],
    ["README.md", "text"],
  ] as const)("should resolve %s as %s", (path, language) => {
    expect(languageForPath(path)).toBe(language);
  });
});

it("should tokenize generated TypeScript with both explorer themes", async () => {
  const lines = await highlightSource(
    "packages/domain/src/Greeting.ts",
    'export const greeting = "hello" as const\n',
  );
  const tokens = lines.flat();

  expect(tokens.map((token) => token.content).join("")).toBe(
    'export const greeting = "hello" as const',
  );
  expect(tokens.length).toBeGreaterThan(4);
  expect(tokens.every((token) => token.light && token.dark)).toBe(true);
});
