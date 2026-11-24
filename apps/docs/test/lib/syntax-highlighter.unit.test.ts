import { assert, describe, it } from "@effect/vitest";
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
    assert.strictEqual(await isHighlighted(path), true);
  });

  it("leaves unsupported files as plain text", async () => {
    assert.deepStrictEqual(
      await highlightSource(".gitignore", "node_modules\ndist"),
      [
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
      ],
    );
  });
});
