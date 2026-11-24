import { describe, expect, it } from "vitest";
import { highlightSource } from "../../app/lib/syntax-highlighter";

const isHighlighted = async (path: string) => {
  const lines = await highlightSource(path, "value");
  return lines.flat().some((token) => token.light !== undefined);
};

describe("highlightSource", () => {
  it.each([
    "src/index.css",
    "Dockerfile",
    ".env",
    "packages/db/.env.example",
    ".envrc",
    "index.html",
    "public/theme-init.js",
    "package.json",
    "biome.jsonc",
    "scripts/hash-env.mjs",
    "flake.nix",
    "src/index.ts",
    "src/app.tsx",
    "pnpm-workspace.yaml",
    "docker-compose.yml",
  ])("highlights %s", async (path) => {
    expect(await isHighlighted(path)).toBe(true);
  });

  it("leaves unsupported files as plain text", async () => {
    expect(await highlightSource(".gitignore", "node_modules\ndist")).toEqual([
      [
        {
          content: "node_modules",
          light: undefined,
          dark: undefined,
          fontStyle: undefined,
        },
      ],
      [
        {
          content: "dist",
          light: undefined,
          dark: undefined,
          fontStyle: undefined,
        },
      ],
    ]);
  });
});
