import { defineTargets, templates } from "@repo/authoring";

const template = templates(new URL("./templates/", import.meta.url));

export const acmeTargets = defineTargets(import.meta.url, [
  {
    kind: "workspace",
    title: "Acme workspace",
    description: "Root of an Acme project",
    requiredModules: ["acme-workspace-readme"],
    contributions: [
      {
        _tag: "file",
        path: "package.json",
        contents: template("./workspace/package.json"),
      },
    ],
  },
  {
    kind: "app",
    title: "Acme app",
    description: "A runnable Acme application",
    defaultName: "web",
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/main.ts",
        contents: template("./app/src/main.ts"),
      },
    ],
  },
]);
