import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

export const configModules = defineModules(import.meta.url, [
  {
    id: "config-typescript-vite",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Config TypeScript Vite",
    description: "Vite TypeScript preset for client applications",
    visibility: "internal",
    supportedOn: [
      { _tag: "kind", kind: "client-react" },
      { _tag: "kind", kind: "client-foldkit" },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "packages/config-typescript/vite.json",
        contents: template(
          "./config-typescript-vite/packages/config-typescript/vite.json",
        ),
      },
      {
        _tag: "pkg-json-entry",
        path: "packages/config-typescript/package.json",
        field: "exports",
        name: "./base.json",
        value: "./base.json",
      },
      {
        _tag: "pkg-json-entry",
        path: "packages/config-typescript/package.json",
        field: "exports",
        name: "./vite.json",
        value: "./vite.json",
      },
    ],
  },
]);
