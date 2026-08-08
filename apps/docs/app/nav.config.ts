export type NavItem = {
  label: string;
  href: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navigation: NavSection[] = [
  {
    title: "Documentation",
    items: [
      { label: "Getting Started", href: "/getting-started" },
      { label: "Brand System", href: "/brand" },
    ],
  },
  {
    title: "CLI Reference",
    items: [
      { label: "Overview", href: "/reference/cli" },
      { label: "Init", href: "/reference/cli/init" },
      { label: "Create", href: "/reference/cli/create" },
      { label: "Add", href: "/reference/cli/add" },
      { label: "Graph", href: "/reference/cli/graph" },
      { label: "Plan", href: "/reference/cli/plan" },
      { label: "Schema", href: "/reference/cli/schema" },
      { label: "Catalog", href: "/reference/cli/catalog" },
    ],
  },
];
