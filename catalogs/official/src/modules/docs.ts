import { defineModules } from "@repo/authoring/Define";
import { templates } from "@repo/authoring/Template";

const template = templates(new URL("../../templates/", import.meta.url));

export const docsModules = defineModules(import.meta.url, [
  {
    id: "docs-mermaid",
    title: "Mermaid Diagrams",
    description: "Render Mermaid diagrams from fenced blocks in MDX guides",
    supportedRuntimes: ["bun"],
    supportedOn: [
      {
        _tag: "kind",
        kind: "docs",
      },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/app/components/mermaid.tsx",
        contents: template("./docs-mermaid/app/components/mermaid.tsx"),
        conflictOnModify: true,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/app/content/diagrams.mdx",
        contents: template("./docs-mermaid/app/content/diagrams.mdx"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "mermaid",
        value: "^12.3.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "dependencies",
        name: "mdx-mermaid",
        value: "^2.0.4",
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/vite.config.ts",
        targetVariable: "docsMdx",
        functionName: "configureMdx",
        argument: "mdxMermaid",
        import: {
          moduleSpecifier: "mdx-mermaid",
          defaultImport: "mdxMermaid",
        },
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/app/routes/docs.tsx",
        targetVariable: "components",
        functionName: "defineComponents",
        field: "mermaid",
        value: "Mermaid",
        import: {
          moduleSpecifier: "../components/mermaid",
          namedImports: ["Mermaid"],
        },
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/app/docs-pages.ts",
        targetVariable: "docsPages",
        functionName: "defineDocsPages",
        field: "diagrams",
        value:
          '{"slug": "diagrams", "title": "Diagrams", "file": "content/diagrams.mdx"}',
      },
    ],
  },
]);
