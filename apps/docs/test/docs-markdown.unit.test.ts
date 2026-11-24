// Inventory checks read actual documentation files from the repository.
// @effect-diagnostics nodeBuiltinImport:off
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import {
  type DocPage,
  docMarkdownPath,
  docPages,
  docsOrigin,
} from "../app/lib/docs-manifest";
import { generateDocsMarkdown } from "../scripts/docs-markdown";

/** Publishes one synthetic page, read from a temporary content directory. */
const publishPage = (source: string, page: Pick<DocPage, "route" | "source">) =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "docs-markdown-"))),
    (directory) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(directory, page.source), source),
        );
        return yield* generateDocsMarkdown({
          pages: [
            { ...page, title: "Synthetic", summary: "", group: "Start here" },
          ],
          contentRoot: pathToFileURL(`${directory}/`),
        });
      }),
    (directory) =>
      Effect.promise(() => rm(directory, { recursive: true, force: true })),
  );

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
        const assets = yield* publishPage(
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
          { route: "/getting-started", source: "getting-started.mdx" },
        );
        const markdown = assets["/getting-started.md"];
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
        const failure = yield* publishPage(source, {
          route: "/",
          source: "unsupported.mdx",
        }).pipe(Effect.flip);
        assert.strictEqual(failure._tag, "DocsMarkdownError");
        assert.strictEqual(failure.source, "unsupported.mdx");
        assert.match(String(failure.cause), /Markdown alternative.*1:\d+/);
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
        ).flatMap(([, url]) =>
          url === undefined ? [] : [new URL(url).pathname],
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
