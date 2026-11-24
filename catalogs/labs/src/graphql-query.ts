import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";

const template = templates(new URL("../templates/", import.meta.url));
const domain = { kind: "package", name: "domain" };

export const graphqlQuery = defineModules(import.meta.url, [
  {
    id: "domain-graphql-item",
    title: "GraphQL Item Contracts",
    description:
      "Item shape and missing-item error for the GraphQL query example",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/CatalogItem.ts",
        contents: template("./domain-graphql-item/src/CatalogItem.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./CatalogItem",
        value: "./src/CatalogItem.ts",
      },
    ],
  },
  {
    id: "server-graphql-query",
    title: "GraphQL Query Endpoint",
    description:
      "Mount an item query backed by an injected Effect lookup service",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "server" }],
    dependencies: [
      {
        _tag: "required-module",
        target: { kind: "server", name: "api" },
        moduleId: "server-http-api",
      },
      {
        _tag: "required-module",
        target: domain,
        moduleId: "domain-graphql-item",
      },
    ],
    contributions: [
      ...[
        "GRAPHQL.md",
        "src/api/GraphQL.ts",
        "src/graphql/schema.ts",
        "src/services/CatalogItems.ts",
      ].map((file) => ({
        _tag: "file" as const,
        path: `{{targetPath}}/${file}`,
        contents: template(`./server-graphql-query/${file}`),
      })),
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "graphql",
        value: "16.15.0",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "GraphQLRoutes",
        import: {
          moduleSpecifier: "./api/GraphQL",
          namedImports: ["GraphQLRoutes"],
        },
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "RouterDependencies",
        functionName: "Layer.mergeAll",
        argument: "CatalogItems.layerMemory",
        import: {
          moduleSpecifier: "./services/CatalogItems",
          namedImports: ["CatalogItems"],
        },
      },
    ],
    nextSteps: [
      "GraphQL Query Server adds `POST /graphql`. See `{{targetPath}}/GRAPHQL.md` for an example query and how to substitute a lookup service.",
    ],
  },
]);
