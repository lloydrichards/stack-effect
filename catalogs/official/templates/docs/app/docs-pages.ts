type DocsPage = { slug: string; title: string; file: string };

const defineDocsPages = (pages: Record<string, DocsPage>) =>
  Object.values(pages);

export const docsPages = defineDocsPages({
  introduction: { slug: "", title: "Introduction", file: "content/index.mdx" },
  gettingStarted: {
    slug: "getting-started",
    title: "Getting started",
    file: "content/getting-started.mdx",
  },
});
