import { index, route, type RouteConfig } from "@react-router/dev/routes";
import { docsPages } from "./docs-pages";
import { sitePages } from "./site-pages";

export default [
  index(sitePages.find((page) => !page.slug)?.file ?? "routes/home.tsx"),
  ...sitePages
    .filter((page) => page.slug)
    .map(({ slug, file }) => route(slug, file)),
  route(
    "docs",
    "routes/docs.tsx",
    docsPages.map(({ slug, file }) => (slug ? route(slug, file) : index(file))),
  ),
] satisfies RouteConfig;
