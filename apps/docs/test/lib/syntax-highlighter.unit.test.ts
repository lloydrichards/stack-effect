import { assert, describe, it } from "@effect/vitest";
import { createHighlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { highlightSource } from "../../app/lib/syntax-highlighter";

// Each path with the grammar it should use and a snippet that grammar
// tokenizes differently from the others.
const cases = [
  ["src/index.css", "css", ".card { color: red; }"],
  ["Dockerfile", "dockerfile", "FROM node:22\nRUN npm ci"],
  [".env", "dotenv", "# comment\nAPI_KEY=secret"],
  ["packages/db/.env.example", "dotenv", "# comment\nDATABASE_URL=file:db"],
  [".envrc", "shellscript", "export PATH=$PWD/bin:$PATH"],
  ["index.html", "html", '<div class="app"></div>'],
  ["public/theme-init.js", "javascript", "const theme = 'dark';"],
  ["package.json", "json", '{ "name": "app" }'],
  ["biome.jsonc", "jsonc", '{\n  // comment\n  "linter": {}\n}'],
  ["scripts/hash-env.mjs", "javascript", "import fs from 'node:fs';"],
  ["flake.nix", "nix", "{ pkgs, ... }: { packages = [ pkgs.bun ]; }"],
  ["src/index.ts", "typescript", "const id: number = 1;"],
  ["src/app.tsx", "tsx", "const App = () => <div>{1}</div>;"],
  ["pnpm-workspace.yaml", "yaml", "packages:\n  - apps/*"],
  ["docker-compose.yml", "yaml", "services:\n  db:\n    image: postgres"],
] as const;

const reference = createHighlighter({
  engine: createJavaScriptRegexEngine(),
  langs: [...new Set(cases.map(([, language]) => language))],
  themes: ["github-light"],
});

const referenceColors = async (
  language: (typeof cases)[number][1],
  source: string,
) =>
  (await reference)
    .codeToTokensBase(source, { lang: language, theme: "github-light" })
    .map((line) => line.map(({ content, color }) => [content, color]));

describe("highlightSource", () => {
  it.each(cases)(
    "highlights %s with the %s grammar",
    async (path, language, source) => {
      const highlighted = await highlightSource(path, source);

      assert.deepStrictEqual(
        highlighted.map((line) =>
          line.map(({ content, light }) => [content, light]),
        ),
        await referenceColors(language, source),
      );
    },
  );

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
