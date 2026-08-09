import {
  index,
  prefix,
  type RouteConfig,
  route,
} from "@react-router/dev/routes";

export default [
  index("content/index.mdx"),
  route("builder", "routes/builder.tsx"),
  route("getting-started", "content/getting-started.mdx"),
  ...prefix("reference/cli", [
    index("content/reference/cli/index.mdx"),
    route("init", "content/reference/cli/init.mdx"),
    route("create", "content/reference/cli/create.mdx"),
    route("add", "content/reference/cli/add.mdx"),
    route("graph", "content/reference/cli/graph.mdx"),
    route("plan", "content/reference/cli/plan.mdx"),
    route("schema", "content/reference/cli/schema.mdx"),
    route("catalog", "content/reference/cli/catalog.mdx"),
  ]),
] satisfies RouteConfig;
