import {
  createBundledHighlighter,
  createSingletonShorthands,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export type SyntaxToken = {
  readonly content: string;
  readonly light: string | undefined;
  readonly dark: string | undefined;
  readonly fontStyle: number | undefined;
};

export type HighlightedSource = ReadonlyArray<ReadonlyArray<SyntaxToken>>;

type Language =
  | "css"
  | "dockerfile"
  | "dotenv"
  | "html"
  | "javascript"
  | "json"
  | "jsonc"
  | "nix"
  | "shellscript"
  | "tsx"
  | "typescript"
  | "yaml";

const languageByExtension: Readonly<Record<string, Language>> = {
  css: "css",
  html: "html",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  mjs: "javascript",
  nix: "nix",
  sh: "shellscript",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

const languageByFilename: Readonly<Record<string, Language>> = {
  ".env": "dotenv",
  ".env.example": "dotenv",
  ".envrc": "shellscript",
  Dockerfile: "dockerfile",
};

export const languageForPath = (path: string): Language | "text" => {
  const filename = path.split("/").at(-1) ?? path;
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  return (
    languageByFilename[filename] ?? languageByExtension[extension] ?? "text"
  );
};

const createHighlighter = createBundledHighlighter({
  engine: () => createJavaScriptRegexEngine(),
  langs: {
    css: () => import("shiki/langs/css.mjs"),
    dockerfile: () => import("shiki/langs/dockerfile.mjs"),
    dotenv: () => import("shiki/langs/dotenv.mjs"),
    html: () => import("shiki/langs/html.mjs"),
    javascript: () => import("shiki/langs/javascript.mjs"),
    json: () => import("shiki/langs/json.mjs"),
    jsonc: () => import("shiki/langs/jsonc.mjs"),
    nix: () => import("shiki/langs/nix.mjs"),
    shellscript: () => import("shiki/langs/shellscript.mjs"),
    tsx: () => import("shiki/langs/tsx.mjs"),
    typescript: () => import("shiki/langs/typescript.mjs"),
    yaml: () => import("shiki/langs/yaml.mjs"),
  },
  themes: {
    "github-dark": () => import("shiki/themes/github-dark.mjs"),
    "github-light": () => import("shiki/themes/github-light.mjs"),
  },
});

const { codeToTokensWithThemes } = createSingletonShorthands(createHighlighter);

export const highlightSource = async (
  path: string,
  source: string,
): Promise<HighlightedSource> => {
  const language = languageForPath(path);
  if (language === "text") return plainSource(source);

  return codeToTokensWithThemes(source, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
  }).then((lines) =>
    lines.map((line) =>
      line.map(({ content, variants }) => ({
        content,
        light: variants["light"]?.color,
        dark: variants["dark"]?.color,
        fontStyle:
          variants["light"]?.fontStyle ??
          variants["dark"]?.fontStyle ??
          undefined,
      })),
    ),
  );
};

const plainSource = (source: string): HighlightedSource =>
  source.split("\n").map((line) => [
    {
      content: line,
      light: undefined,
      dark: undefined,
      fontStyle: undefined,
    },
  ]);
