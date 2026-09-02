import { readFile } from "node:fs/promises";
import mdx from "@mdx-js/rollup";
import { reactRouter } from "@react-router/dev/vite";
import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from "@shikijs/transformers";
import tailwindcss from "@tailwindcss/vite";
import mdxMermaid from "mdx-mermaid";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { defineConfig, type Plugin } from "vite";
import remarkTocExport from "./app/lib/remark-toc-export.ts";

const codingAgentGuideUrl = "/use-with-coding-agents.md";
const codingAgentGuideModule = "virtual:coding-agent-guide-markdown";
const resolvedCodingAgentGuideModule = `\0${codingAgentGuideModule}`;
const codingAgentGuidePath = new URL(
  "./app/content/use-with-coding-agents.mdx",
  import.meta.url,
);
const loadCodingAgentGuide = () => readFile(codingAgentGuidePath, "utf8");

const codingAgentGuideMarkdown = (): Plugin => ({
  name: "coding-agent-guide-markdown",
  enforce: "pre",
  resolveId(id) {
    return id === codingAgentGuideModule
      ? resolvedCodingAgentGuideModule
      : undefined;
  },
  async load(id) {
    return id === resolvedCodingAgentGuideModule
      ? `export default ${JSON.stringify(await loadCodingAgentGuide())};`
      : undefined;
  },
  configureServer(server) {
    server.middlewares.use(codingAgentGuideUrl, (_request, response) => {
      response.setHeader("Content-Type", "text/markdown; charset=utf-8");
      loadCodingAgentGuide().then((guide) => response.end(guide));
    });
  },
  async generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: codingAgentGuideUrl.slice(1),
      source: await loadCodingAgentGuide(),
    });
  },
});

export default defineConfig({
  plugins: [
    codingAgentGuideMarkdown(),
    mdx({
      providerImportSource: "@mdx-js/react",
      remarkPlugins: [remarkGfm, mdxMermaid, remarkTocExport],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "append",
            properties: {
              className: ["subheading-anchor"],
              ariaLabel: "Link to section",
            },
          },
        ],
        [
          rehypePrettyCode,
          {
            theme: {
              dark: "github-dark",
              light: "github-light",
            },
            defaultColor: false,
            keepBackground: false,
            transformers: [
              transformerNotationDiff(),
              transformerNotationHighlight(),
              transformerNotationFocus(),
            ],
          },
        ],
      ],
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
