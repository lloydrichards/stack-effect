import { describe, expect, it } from "vitest";
import { languageForPath } from "../../app/lib/syntax-highlighter";

describe("languageForPath", () => {
  it.each([
    ["src/index.css", "css"],
    ["Dockerfile", "dockerfile"],
    [".env", "dotenv"],
    ["packages/db/.env.example", "dotenv"],
    [".envrc", "shellscript"],
    ["index.html", "html"],
    ["public/theme-init.js", "javascript"],
    ["package.json", "json"],
    ["biome.jsonc", "jsonc"],
    ["scripts/hash-env.mjs", "javascript"],
    ["flake.nix", "nix"],
    ["src/index.ts", "typescript"],
    ["src/app.tsx", "tsx"],
    ["pnpm-workspace.yaml", "yaml"],
    ["docker-compose.yml", "yaml"],
  ] as const)("maps %s to %s", (path, language) => {
    expect(languageForPath(path)).toBe(language);
  });

  it("leaves unsupported files as plain text", () => {
    expect(languageForPath(".gitignore")).toBe("text");
  });
});
