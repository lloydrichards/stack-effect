import { index, route, type RouteConfig } from "@react-router/dev/routes";
import { docsPages } from "./docs-pages";

export default [
  index("routes/home.tsx"),
  route(
    "docs",
    "routes/docs.tsx",
    docsPages.map(({ slug, file }) => (slug ? route(slug, file) : index(file))),
  ),
] satisfies RouteConfig;
