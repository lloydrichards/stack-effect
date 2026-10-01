// Build-time adapter reads the documentation sources through Node filesystem APIs.
// @effect-diagnostics nodeBuiltinImport:off
import { readFile } from "node:fs/promises";
import { Array as Arr, Data, Effect, Match, pipe } from "effect";
import type { Nodes } from "mdast";
import type { Handle } from "mdast-util-to-markdown";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import stripAnsi from "strip-ansi";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import {
  docMarkdownPath,
  docPages,
  docsOrigin,
} from "../app/lib/docs-manifest.ts";

export class DocsMarkdownError extends Data.TaggedError("DocsMarkdownError")<{
  readonly source: string;
  readonly cause: unknown;
}> {}

const markdownUrl = (url: string, route: string) => {
  const resolved = new URL(url, `${docsOrigin}${route}`);
  const page = docPages.find((entry) => entry.route === resolved.pathname);
  return resolved.origin === docsOrigin && page
    ? `${docsOrigin}${docMarkdownPath(page.route)}${resolved.search}${resolved.hash}`
    : resolved.href;
};

// These errors cross the throwing serializer API and are mapped into Effect below.
const unsupported = (node: Nodes, detail: string): never => {
  throw new Error(
    `${detail} at ${node.position?.start.line ?? "?"}:${node.position?.start.column ?? "?"}`,
  );
};

type JsxElement = Extract<
  Nodes,
  { type: "mdxJsxFlowElement" | "mdxJsxTextElement" }
>;

type MarkdownHandle = (
  node: Nodes,
  parent: Parameters<Handle>[1],
  state: Parameters<Handle>[2],
  info: Parameters<Handle>[3],
) => string;

const literalAttribute = (node: JsxElement, name: string): string => {
  const attribute = node.attributes.find(
    (entry) => entry.type === "mdxJsxAttribute" && entry.name === name,
  );
  if (!attribute || attribute.type !== "mdxJsxAttribute")
    return unsupported(node, `Missing ${name} on ${node.name}`);
  if (typeof attribute.value === "string") return attribute.value;
  const expression = attribute.value?.data?.estree?.body[0];
  if (expression?.type !== "ExpressionStatement")
    return unsupported(node, `Expected literal ${name} on ${node.name}`);
  const value = expression.expression;
  if (value.type === "Literal" && typeof value.value === "string")
    return value.value;
  if (value.type === "TemplateLiteral" && value.expressions.length === 0) {
    const cooked = value.quasis[0]?.value.cooked;
    return (
      cooked ?? unsupported(node, `Invalid literal ${name} on ${node.name}`)
    );
  }
  return unsupported(
    node,
    `Dynamic ${name} on ${node.name} needs a Markdown alternative`,
  );
};

const serializeJsx =
  (route: string): MarkdownHandle =>
  (node, parent, state, info) => {
    if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement")
      return unsupported(node, "Expected JSX");
    const children = () =>
      node.type === "mdxJsxTextElement"
        ? state.containerPhrasing(node, info)
        : state.containerFlow(node, info);
    return Match.value(node.name).pipe(
      Match.when("div", children),
      Match.when("h1", () => `# ${children().trim()}`),
      Match.when(
        "Link",
        () =>
          `[${children().trim()}](<${markdownUrl(literalAttribute(node, "to"), route)}>)`,
      ),
      Match.when(
        "DisclosurePanel",
        () =>
          `${state.handle({ type: "heading", depth: 2, children: [{ type: "text", value: literalAttribute(node, "title") }] }, parent, state, info)}\n\n${literalAttribute(node, "description")}\n\n${children()}`,
      ),
      Match.when(
        "AnsiTerminal",
        () =>
          `${literalAttribute(node, "title")}\n\n${state.handle({ type: "code", lang: "text", value: stripAnsi(literalAttribute(node, "input")) }, parent, state, info)}`,
      ),
      Match.when(
        "BlueprintWorkbench",
        () =>
          `The interactive workbench demonstrates how a Selection becomes a Blueprint and a Plan. Use [Recipe Builder](${docsOrigin}/builder) to choose capabilities and preview a project. It requires a browser; coding agents should use the CLI schema and Plan workflow.`,
      ),
      Match.orElse(() =>
        unsupported(
          node,
          `Unsupported component ${node.name ?? "fragment"}; add a Markdown alternative`,
        ),
      ),
    );
  };

const serializeExpression: MarkdownHandle = (node) =>
  "value" in node && /^\s*\/\*[\s\S]*\*\/\s*$/.test(node.value)
    ? ""
    : unsupported(node, "Dynamic content needs a Markdown alternative");

export const convertDocMarkdown = Effect.fn("Docs.convertMarkdown")(function* (
  source: string,
  route: string,
  filename = route,
) {
  return yield* Effect.try({
    try: () => {
      const processor = unified()
        .use(remarkParse)
        .use(remarkMdx)
        .use(remarkGfm)
        .use(remarkStringify, {
          fences: true,
          bullet: "-",
          handlers: {
            mdxjsEsm: () => "",
            mdxJsxFlowElement: serializeJsx(route),
            mdxJsxTextElement: serializeJsx(route),
            mdxFlowExpression: serializeExpression,
            mdxTextExpression: serializeExpression,
          },
        });
      const tree = processor.parse(source);
      visit(tree, (node) => {
        if (
          node.type === "link" ||
          node.type === "image" ||
          node.type === "definition"
        )
          node.url = markdownUrl(node.url, route);
      });
      return processor.stringify(tree).trim() + "\n";
    },
    catch: (cause) => new DocsMarkdownError({ source: filename, cause }),
  });
});

const llmsIndex = () => `# Stack Effect

> A CLI for creating and extending full-stack TypeScript repositories built with Effect.

Start with the coding-agent guide. Use the CLI's schema output to discover current capabilities and Plan input, then produce read-only Plans before changing a repository. Respect the user's existing authorization and request approval for actions outside it. Catalogs can change independently of the CLI version; inspect Plan source digests and freshness.

${pipe(
  docPages,
  Arr.groupBy((page) => page.group),
  (groups) =>
    Object.entries(groups)
      .map(
        ([group, pages]) =>
          `## ${group}\n\n${pages.map((page) => `- [${page.title}](${docsOrigin}${docMarkdownPath(page.route)}): ${page.summary}`).join("\n")}`,
      )
      .join("\n\n"),
)}

## Machine-readable resources

- [Official catalog](${docsOrigin}/registry/v1/catalog.json): Live catalog definitions, not Plan input. Prefer CLI discovery against the project's selected sources.
- [Author catalog](${docsOrigin}/registry/v1/author.json): Definitions for scaffolding a standalone catalog project.
- [Project configuration schema](${docsOrigin}/schemas/v1/stack.effect.schema.json): Schema for stack.effect.json. The CLI schema command emits the separate Plan input schema.
`;

export const loadDocMarkdown = Effect.fn("Docs.loadMarkdown")(function* (
  page: (typeof docPages)[number],
) {
  const source = yield* Effect.tryPromise({
    try: () =>
      readFile(
        new URL(`../app/content/${page.source}`, import.meta.url),
        "utf8",
      ),
    catch: (cause) => new DocsMarkdownError({ source: page.source, cause }),
  });
  return yield* convertDocMarkdown(source, page.route, page.source);
});

export const generateDocsMarkdown = Effect.fn("Docs.generateMarkdown")(
  function* () {
    const pages = yield* Effect.forEach(docPages, (page) =>
      Effect.gen(function* () {
        const markdown = yield* loadDocMarkdown(page);
        return [docMarkdownPath(page.route), markdown] as const;
      }),
    );
    const assets: Record<string, string> & { readonly "/llms.txt": string } = {
      ...Object.fromEntries(pages),
      "/llms.txt": llmsIndex(),
    };
    return assets;
  },
);
