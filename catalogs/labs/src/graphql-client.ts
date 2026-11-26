import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";
import { EFFECT_VERSION } from "@repo/catalog-official/dependencies";

const template = templates(new URL("../templates/", import.meta.url));
const domain = { kind: "package", name: "domain" };
const api = { kind: "server", name: "api" };

export const graphqlClient = defineModules(import.meta.url, [
  {
    id: "domain-upstream-item",
    title: "Upstream Item Contracts",
    description: "Item schema and missing-item error for an upstream lookup",
    visibility: "internal",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: EFFECT_VERSION,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/UpstreamItem.ts",
        contents: template("./domain-upstream-item/src/UpstreamItem.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./UpstreamItem",
        value: "./src/UpstreamItem.ts",
      },
    ],
  },
  {
    id: "server-graphql-client",
    title: "Upstream GraphQL Client",
    description: "Read one item through the generated GraphQL query server",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "identity", identity: api }],
    dependencies: [
      {
        _tag: "required-module",
        target: api,
        moduleId: "server-graphql-query",
      },
      {
        _tag: "required-module",
        target: domain,
        moduleId: "domain-upstream-item",
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "effect",
        value: EFFECT_VERSION,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/GRAPHQL-CLIENT.md",
        contents: template("./server-graphql-client/GRAPHQL-CLIENT.md"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/graphql/Items.ts",
        contents: template("./server-graphql-client/src/graphql/Items.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/api/UpstreamItems.ts",
        contents: template("./server-graphql-client/src/api/UpstreamItems.ts"),
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "UpstreamItemsRoutes",
        import: {
          moduleSpecifier: "./api/UpstreamItems",
          namedImports: ["UpstreamItemsRoutes"],
        },
      },
    ],
    nextSteps: [
      "GraphQL Client adds `GET /upstream-items/:id`. See `{{targetPath}}/GRAPHQL-CLIENT.md` to try the generated client and query endpoint together.",
    ],
  },
]);
