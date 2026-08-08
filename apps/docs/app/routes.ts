import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("content/index.mdx"),
  route("getting-started", "content/getting-started.mdx"),
] satisfies RouteConfig;
