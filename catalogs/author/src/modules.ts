import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));

const starterFile = (path: string) => ({
  _tag: "file" as const,
  path: `{{targetPath}}/${path}`,
  contents: template(`./catalog-starter/${path}`),
});

const catalogEntry = (targetVariable: string, argument: string) => ({
  _tag: "ts-call-arg" as const,
  path: "{{targetPath}}/catalog/index.ts",
  targetVariable,
  functionName: "Array.of",
  argument,
  import: { moduleSpecifier: "./starter.ts", namedImports: [argument] },
});

export const moduleGroup = defineModules(import.meta.url, [
  {
    id: "catalog-starter",
    title: "Starter Catalog",
    description:
      "A small standalone catalog to edit: a workspace target, an app target, and a greeting module backed by one template file",
    visibility: "internal",
    supportedOn: [{ _tag: "kind", kind: "catalog" }],
    dependencies: [],
    contributions: [
      starterFile("catalog/tokens.ts"),
      starterFile("catalog/starter.ts"),
      starterFile("templates/workspace/package.json"),
      starterFile("templates/app-greeting/src/greeting.ts"),
      catalogEntry("targets", "starterTargets"),
      catalogEntry("modules", "starterModules"),
    ],
  },
]);
