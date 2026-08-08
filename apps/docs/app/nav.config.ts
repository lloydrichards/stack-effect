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
];
