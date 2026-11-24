// Inventory checks read actual documentation files from the repository.
// @effect-diagnostics nodeBuiltinImport:off
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
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
        assert.include(guide, "## Before you begin");
        assert.include(
          guide,
          "Check the tools and local ports used in this tutorial.",
        );
        assert.include(guide, "git config --get user.email");
        assert.include(guide, "stack-effect · plan\n\n```text\nPlan");
        assert.include(guide, "Created: 9 files");
        assert.include(guide, '"Hello Effect!"');
        assert.notMatch(guide, /<AnsiTerminal|<DisclosurePanel|className/);
        assert.notInclude(guide, "\u001b");
        assert.include(
          assets["/index.md"],
          "# Scaffold an Effect application.",
        );
        assert.include(
          assets["/index.md"],
          `[Recipe Builder](${docsOrigin}/builder)`,
        );
        assert.include(assets["/how-it-works.md"], "```mermaid");
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
        assert.isDefined(markdown);
        assert.notInclude(markdown, 'import Component from "component";');
        assert.include(markdown, 'import { Effect } from "effect";');
        assert.include(
          markdown,
          "export const view = <Component value={1} />;",
        );
        assert.include(
          markdown,
          `${docsOrigin}/reference/cli/plan.md#examples`,
        );
        assert.include(markdown, `${docsOrigin}/getting-started.md#example`);
        assert.match(markdown, /\| Option\s*\| Value\s*\|/);
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
        assert.deepStrictEqual(
          docPages.map((page) => page.source).toSorted(),
          files.filter((file) => file.endsWith(".mdx")).toSorted(),
        );
        const assets = yield* generateDocsMarkdown();
        const paths = docPages.map((page) => docMarkdownPath(page.route));
        assert.strictEqual(new Set(paths).size, paths.length);
        assert.deepStrictEqual(
          Object.keys(assets).toSorted(),
          [...paths, "/llms.txt"].toSorted(),
        );
        const index = assets["/llms.txt"];
        const markdownLinks = Array.from(
          index.matchAll(/\]\((https:\/\/[^)]+\.md)\)/g),
        ).flatMap(([, url]) =>
          url === undefined ? [] : [new URL(url).pathname],
        );
        assert.deepStrictEqual(markdownLinks, paths);
        assert.strictEqual(markdownLinks[0], "/use-with-coding-agents.md");
        assert.include(assets["/reference/cli/schema.md"], "--root");
        assert.notInclude(assets["/reference/cli/schema.md"], "Generated from");
      }),
  );
});
