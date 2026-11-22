import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));
const domain = { kind: "package", name: "domain" };

export const graphqlClient = defineModules(import.meta.url, [
  {
    id: "domain-upstream-item",
    title: "Upstream Item",
    description: "Item schema and missing-item error for an upstream lookup",
    visibility: "internal",
    supportedRuntimes: ["bun"],
    supportedOn: [{ _tag: "identity", identity: domain }],
    dependencies: [],
    contributions: [
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
    title: "GraphQL Client",
    description:
      "Read one item from an upstream GraphQL endpoint with a local fixture",
    supportedRuntimes: ["bun"],
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
        moduleId: "domain-upstream-item",
      },
    ],
    contributions: [
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
        _tag: "file",
        path: "{{targetPath}}/src/fixtures/graphql.ts",
        contents: template("./server-graphql-client/src/fixtures/graphql.ts"),
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllRouters",
        functionName: "Layer.mergeAll",
        argument: "UpstreamItemsLive",
        import: {
          moduleSpecifier: "./api/UpstreamItems",
          namedImports: ["UpstreamItemsLive"],
        },
      },
    ],
    nextSteps: [
      "GraphQL Client adds `GET /upstream-items/:id`. See `{{targetPath}}/GRAPHQL-CLIENT.md` for the local fixture and example responses.",
    ],
  },
]);
