import { defineTargets, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));

const file = (path: string, source: string, conflictOnModify?: boolean) => ({
  _tag: "file" as const,
  path,
  contents: template(source),
  ...(conflictOnModify === undefined ? {} : { conflictOnModify }),
});

export const targetGroup = defineTargets(import.meta.url, [
  {
    kind: "catalog",
    supportedRuntimes: ["bun", "node"],
    title: "Catalog Registry",
    description:
      "A standalone Stack Effect catalog: TypeScript definitions and template files that build a v1 JSON document for a static host",
    defaultName: "registry",
    visibility: "public",
    requiredModules: ["catalog-starter"],
    contributions: [
      file("{{targetPath}}/package.json", "./catalog/package.json"),
      file("{{targetPath}}/tsconfig.json", "./catalog/tsconfig.json", true),
      file("{{targetPath}}/README.md", "./catalog/README.md"),
      file("{{targetPath}}/catalog/index.ts", "./catalog/catalog/index.ts"),
      file(
        "{{targetPath}}/scripts/platform.ts",
        "./catalog/scripts/platform.ts",
      ),
      file("{{targetPath}}/scripts/build.ts", "./catalog/scripts/build.ts"),
      file(
        "{{targetPath}}/scripts/validate.ts",
        "./catalog/scripts/validate.ts",
      ),
      file("{{targetPath}}/scripts/preview.ts", "./catalog/scripts/preview.ts"),
      // Template files are embedded byte for byte, so workspace tools must not
      // rewrite them. Each tool reads a nested config or ignore file here.
      file(
        "{{#if format=oxfmt}}{{targetPath}}/.oxfmtrc.jsonc{{/if}}",
        "./catalog/_oxfmtrc.jsonc",
      ),
      file(
        "{{#if format=dprint}}{{targetPath}}/dprint.json{{/if}}",
        "./catalog/dprint.json",
      ),
      file(
        "{{#if lint=oxlint}}{{targetPath}}/.eslintignore{{/if}}",
        "./catalog/_eslintignore",
      ),
      file(
        "{{#if lint=biome}}{{targetPath}}/biome.jsonc{{/if}}",
        "./catalog/biome.jsonc",
      ),
      file(
        "{{#if format=biome}}{{targetPath}}/biome.jsonc{{/if}}",
        "./catalog/biome.jsonc",
      ),
    ],
    nextSteps: [
      "Catalog: in {{targetPath}}, run `{{packageManager}} run validate`, `{{packageManager}} run preview app/:app-greeting`, and `{{packageManager}} run build`",
    ],
  },
]);
