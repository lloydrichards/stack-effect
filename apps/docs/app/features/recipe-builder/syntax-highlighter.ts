import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import json from "shiki/langs/json.mjs";
import jsonc from "shiki/langs/jsonc.mjs";
import nix from "shiki/langs/nix.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";

export type SyntaxToken = {
  readonly content: string;
  readonly light: string | undefined;
  readonly dark: string | undefined;
  readonly fontStyle: number | undefined;
};

export type HighlightedSource = ReadonlyArray<ReadonlyArray<SyntaxToken>>;

type Language =
  | "css"
  | "html"
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
  json: "json",
  jsonc: "jsonc",
  nix: "nix",
  sh: "shellscript",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

const languageByFilename: Readonly<Record<string, Language>> = {
  ".envrc": "shellscript",
  Dockerfile: "shellscript",
};

export const languageForPath = (path: string): Language | "text" => {
  const filename = path.split("/").at(-1) ?? path;
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  return (
    languageByFilename[filename] ?? languageByExtension[extension] ?? "text"
  );
};

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  themes: [githubLight, githubDark],
  langs: [css, html, json, jsonc, nix, shellscript, tsx, typescript, yaml],
});

export const highlightSource = async (
  path: string,
  source: string,
): Promise<HighlightedSource> => {
  const language = languageForPath(path);
  if (language === "text") return plainSource(source);

  return (await highlighter)
    .codeToTokensWithThemes(source, {
      lang: language,
      themes: { light: "github-light", dark: "github-dark" },
    })
    .map((line) =>
      line.map(({ content, variants }) => ({
        content,
        light: variants["light"]?.color,
        dark: variants["dark"]?.color,
        fontStyle:
          variants["light"]?.fontStyle ??
          variants["dark"]?.fontStyle ??
          undefined,
      })),
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
