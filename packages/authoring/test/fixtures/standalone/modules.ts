import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("./templates/", import.meta.url));

export const acmeModules = defineModules(import.meta.url, [
  {
    id: "acme-workspace-readme",
    title: "README",
    description: "Project README",
    visibility: "internal",
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "README.md",
        contents: template("./workspace/README.md"),
      },
    ],
  },
  {
    id: "acme-app-greeting",
    title: "Greeting",
    description: "Logs a greeting on start",
    supportedOn: [{ _tag: "kind", kind: "app" }],
    dependencies: [
      {
        _tag: "required-module",
        target: { kind: "workspace", name: "" },
        moduleId: "acme-workspace-readme",
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/greeting.ts",
        contents: template("./app/src/greeting.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "greet",
        value:
          "{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}node{{/if}} src/greeting.ts",
      },
    ],
  },
]);
