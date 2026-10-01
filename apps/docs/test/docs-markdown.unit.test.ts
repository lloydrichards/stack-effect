// Inventory checks read actual documentation files from the repository.
// @effect-diagnostics nodeBuiltinImport:off
import { readdir } from "node:fs/promises";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import {
  docMarkdownPath,
  docPages,
  docsOrigin,
} from "../app/lib/docs-manifest";
import {
  convertDocMarkdown,
  generateDocsMarkdown,
} from "../scripts/docs-markdown";

describe("published documentation Markdown", () => {
  it.effect(
    "preserves prerequisites and terminal examples without JSX or terminal colors",
    () =>
      Effect.gen(function* () {
        const assets = yield* generateDocsMarkdown();
        const guide = assets["/getting-started.md"];
        expect(guide).toContain("## Before you begin");
        expect(guide).toContain(
          "Check the tools and local ports used in this tutorial.",
        );
        expect(guide).toContain("git config --get user.email");
        expect(guide).toContain("stack-effect · plan\n\n```text\nPlan");
        expect(guide).toContain("Created: 9 files");
        expect(guide).toContain('"Hello Effect!"');
        expect(guide).not.toMatch(/<AnsiTerminal|<DisclosurePanel|className/);
        expect(guide).not.toContain("\u001b");
        expect(assets["/index.md"]).toContain(
          "# Scaffold an Effect application.",
        );
        expect(assets["/index.md"]).toContain(
          `[Recipe Builder](${docsOrigin}/builder)`,
        );
        expect(assets["/how-it-works.md"]).toContain("```mermaid");
      }),
  );

  it.effect(
    "preserves fenced source code and GFM while resolving copied documentation links",
    () =>
      Effect.gen(function* () {
        const markdown = yield* convertDocMarkdown(
          `import Component from "component";

# Example

[Plan](/reference/cli/plan#examples) and [This section](#example).

| Option | Value |
| --- | --- |
| root | cwd |

\`\`\`tsx
import { Effect } from "effect";
export const view = <Component value={1} />;
\`\`\`
`,
          "/getting-started",
        );
        expect(markdown).not.toContain('import Component from "component";');
        expect(markdown).toContain('import { Effect } from "effect";');
        expect(markdown).toContain(
          "export const view = <Component value={1} />;",
        );
        expect(markdown).toContain(
          `${docsOrigin}/reference/cli/plan.md#examples`,
        );
        expect(markdown).toContain(`${docsOrigin}/getting-started.md#example`);
        expect(markdown).toMatch(/\| Option\s*\| Value\s*\|/);
      }),
  );

  it.effect.each([
    "<UnknownComponent />",
    "<h1>{secret}</h1>",
    '<Link to="/getting-started">{secret}</Link>',
    "{process.env.SECRET}",
    '<AnsiTerminal title="Example" input={readSecret()} />',
    '<AnsiTerminal title="Example" input={`Value: ${secret}`} />',
  ])(
    "refuses unsupported content instead of evaluating or dropping it: %s",
    (source) =>
      Effect.gen(function* () {
        const result = yield* convertDocMarkdown(
          source,
          "/",
          "unsupported.mdx",
        ).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.source).toBe("unsupported.mdx");
          expect(String(result.failure.cause)).toMatch(
            /Markdown alternative.*1:\d+/,
          );
        }
      }),
  );

  it.effect(
    "indexes every content page and points only to published Markdown assets",
    () =>
      Effect.gen(function* () {
        const files = yield* Effect.promise(() =>
          readdir(new URL("../app/content/", import.meta.url), {
            recursive: true,
          }),
        );
        expect(docPages.map((page) => page.source).toSorted()).toEqual(
          files.filter((file) => file.endsWith(".mdx")).toSorted(),
        );
        const assets = yield* generateDocsMarkdown();
        const paths = docPages.map((page) => docMarkdownPath(page.route));
        expect(new Set(paths).size).toBe(paths.length);
        expect(Object.keys(assets).toSorted()).toEqual(
          [...paths, "/llms.txt"].toSorted(),
        );
        const index = assets["/llms.txt"];
        const markdownLinks = Array.from(
          index.matchAll(/\]\((https:\/\/[^)]+\.md)\)/g),
          ([, url]) => new URL(url!).pathname,
        );
        expect(markdownLinks).toEqual(paths);
        expect(markdownLinks[0]).toBe("/use-with-coding-agents.md");
        expect(assets["/reference/cli/schema.md"]).toContain("--root");
        expect(assets["/reference/cli/schema.md"]).not.toContain(
          "Generated from",
        );
      }),
  );
});
