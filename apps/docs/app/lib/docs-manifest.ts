export const docsOrigin = "https://stack-effect.lloydrichards.dev";

export type DocPage = {
  readonly route: string;
  readonly source: string;
  readonly title: string;
  readonly summary: string;
  readonly group: "Start here" | "Catalogs" | "CLI reference";
};

export const docPages: ReadonlyArray<DocPage> = [
  {
    route: "/use-with-coding-agents",
    source: "use-with-coding-agents.mdx",
    title: "Use Stack Effect with coding agents",
    summary:
      "Discover capabilities, produce read-only Plans, and act within the user's authorization.",
    group: "Start here",
  },
  {
    route: "/",
    source: "index.mdx",
    title: "Stack Effect",
    summary:
      "Create and extend full-stack TypeScript repositories built with Effect.",
    group: "Start here",
  },
  {
    route: "/getting-started",
    source: "getting-started.mdx",
    title: "Build your first Stack Effect project",
    summary:
      "Create a workspace and connect a React client to an Effect HTTP API.",
    group: "Start here",
  },
  {
    route: "/how-it-works",
    source: "how-it-works.mdx",
    title: "How Stack Effect changes your repository",
    summary: "Understand Selection, Blueprint, Plan, Apply, and Finalize.",
    group: "Start here",
  },
  {
    route: "/catalog-registry",
    source: "catalog-registry.mdx",
    title: "Catalog updates and sources",
    summary:
      "Source selection, current definitions, compatible caches, and configuration.",
    group: "Catalogs",
  },
  {
    route: "/publish-catalog-registry",
    source: "publish-catalog-registry.mdx",
    title: "Publish your own catalog",
    summary: "Author, host, and select standalone or extension catalogs.",
    group: "Catalogs",
  },
  ...(
    [
      ["", "index", "CLI overview", "Commands and global options."],
      [
        "/schema",
        "schema",
        "stack-effect schema",
        "Discover the loaded catalog and Plan input JSON Schema.",
      ],
      [
        "/plan",
        "plan",
        "stack-effect plan",
        "Read a Selection and return structured read-only Plans.",
      ],
      [
        "/init",
        "init",
        "stack-effect init",
        "Initialize a workspace with explicit non-interactive options.",
      ],
      [
        "/create",
        "create",
        "stack-effect create",
        "Create a project from explicit targets and modules.",
      ],
      [
        "/add",
        "add",
        "stack-effect add",
        "Add capabilities to an existing project and preview changes.",
      ],
      [
        "/graph",
        "graph",
        "stack-effect graph",
        "Inspect target and module dependencies.",
      ],
      [
        "/catalog",
        "catalog",
        "stack-effect catalog",
        "Inspect and work with catalogs.",
      ],
    ] as const
  ).map(([suffix, source, title, summary]) => ({
    route: `/reference/cli${suffix}`,
    source: `reference/cli/${source}.mdx`,
    title,
    summary,
    group: "CLI reference" as const,
  })),
];

export const docMarkdownPath = (route: string) =>
  route === "/" ? "/index.md" : `${route}.md`;

export const findDocPage = (pathname: string) =>
  docPages.find((page) => page.route === pathname);

export const agentBootstrapPrompt = `Read ${docsOrigin}/use-with-coding-agents.md before using Stack Effect. Inspect the repository root and stack.effect.json, if present. If I have not supplied a goal, ask what I want to build or change. Otherwise begin read-only discovery and planning for that goal. Pin one CLI version, discover current target and module IDs using the same catalog sources as planning, and construct a Selection from the emitted input schema. Present the proposed paths, conflicts, catalog source digests and freshness, and Finalize commands. Follow the guide for new or existing repositories. Respect authorization I have already given; request approval for actions outside it. Restart discovery and planning if catalog digests differ between Plan formats. Disclose cached sources. Never invent a command to apply Plan JSON or use interactive prompts.`;
