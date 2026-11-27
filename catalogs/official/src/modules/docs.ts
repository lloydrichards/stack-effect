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
  {
    id: "docs-api-reference",
    title: "API Reference",
    description:
      "Generate a browsable list of TypeScript exports from your library entry points",
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
        path: "{{targetPath}}/app/content/reference/api.mdx",
        contents: template(
          "./docs-api-reference/app/content/reference/api.mdx",
        ),
        conflictOnModify: true,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/app/components/api-exports.tsx",
        contents: template(
          "./docs-api-reference/app/components/api-exports.tsx",
        ),
        conflictOnModify: true,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/app/lib/api-exports.json",
        contents: template("./docs-api-reference/app/lib/api-exports.json"),
        conflictOnModify: true,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/generate-api-reference.ts",
        contents: template(
          "./docs-api-reference/scripts/generate-api-reference.ts",
        ),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "ts-morph",
        value: "^28.0.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "docs:api",
        value: "bun run scripts/generate-api-reference.ts",
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/app/docs-pages.ts",
        targetVariable: "docsPages",
        functionName: "defineDocsPages",
        field: "apiReference",
        value:
          '{"slug": "reference/api", "title": "API reference", "file": "content/reference/api.mdx"}',
      },
    ],
  },
  {
    id: "docs-header-pages",
    title: "Header Pages",
    description:
      "Add a product homepage and an About page alongside the handbook",
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
        path: "{{targetPath}}/app/routes/product-home.tsx",
        contents: template("./docs-header-pages/app/routes/product-home.tsx"),
        conflictOnModify: true,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/app/routes/about.tsx",
        contents: template("./docs-header-pages/app/routes/about.tsx"),
        conflictOnModify: true,
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/app/site-pages.ts",
        targetVariable: "sitePages",
        functionName: "defineSitePages",
        field: "home",
        value:
          '{"slug": "", "title": "Home", "file": "routes/product-home.tsx"}',
      },
      {
        _tag: "ts-object-field",
        path: "{{targetPath}}/app/site-pages.ts",
        targetVariable: "sitePages",
        functionName: "defineSitePages",
        field: "about",
        value:
          '{"slug": "about", "title": "About", "file": "routes/about.tsx"}',
      },
    ],
  },
]);
