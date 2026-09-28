import { defineTargets, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));

export const targetGroup = defineTargets(import.meta.url, [
  {
    kind: "workspace",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Project Initialization",
    description:
      "Set up a new project with recommended structure and configuration",
    visibility: "internal",
    requiredModules: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/.gitignore",
        contents: template("./workspace/_gitignore"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./workspace/package.json"),
      },
      {
        _tag: "file",
        path: "{{#if runtime=deno}}{{targetPath}}/deno.json{{/if}}",
        contents: template("./workspace/deno.json"),
      },
      {
        _tag: "file",
        path: "{{#if packageManager=pnpm}}{{targetPath}}/pnpm-workspace.yaml{{/if}}",
        contents: template("./workspace/pnpm-workspace.yaml"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./workspace/tsconfig.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/packages/config-typescript/base.json",
        contents: template("./workspace/packages/config-typescript/base.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/packages/config-typescript/package.json",
        contents: template(
          "./workspace/packages/config-typescript/package.json",
        ),
      },
    ],
  },

  {
    kind: "client-react",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Client React Application",
    description: "A frontend application built with React",
    defaultName: "web",
    requiredModules: ["config-typescript-vite"],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./client-react/package.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/index.html",
        contents: template("./client-react/index.html"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/components.json",
        contents: template("./client-react/components.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/main.tsx",
        contents: template("./client-react/src/main.tsx"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/app.tsx",
        contents: template("./client-react/src/app.tsx"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.css",
        contents: template("./client-react/src/index.css"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/vite.config.ts",
        contents: template("./client-react/vite.config.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.config.json",
        contents: template("./client-react/tsconfig.config.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/utils.ts",
        contents: template("./client-react/src/lib/utils.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/atom.ts",
        contents: template("./client-react/src/lib/atom.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/theme-toggle.tsx",
        contents: template("./client-react/src/components/theme-toggle.tsx"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/vite-env.d.ts",
        contents: template("./client-react/src/vite-env.d.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./client-react/tsconfig.json"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "vite build",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "vite --host --clearScreen false",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run --passWithNoTests",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "preview",
        value: "vite preview",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
    scripts: [
      {
        label: "Install shadcn client components",
        command:
          "{{#if runtime=deno}}deno run -A npm:shadcn@latest add button card input switch --yes --overwrite{{/if}}{{#if runtime=bun}}bunx shadcn@latest add button card input switch --yes --overwrite{{/if}}{{#if runtime=node}}bunx shadcn@latest add button card input switch --yes --overwrite{{/if}}",
      },
    ],
  },

  {
    kind: "client-foldkit",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Client Foldkit Application",
    description: "A frontend application built with Foldkit (Elm Architecture)",
    defaultName: "web",
    requiredModules: ["config-typescript-vite"],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./client-foldkit/package.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/index.html",
        contents: template("./client-foldkit/index.html"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/public/theme-init.js",
        contents: template("./client-foldkit/public/theme-init.js"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/entry.ts",
        contents: template("./client-foldkit/src/entry.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/main.ts",
        contents: template("./client-foldkit/src/main.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/theme.ts",
        contents: template("./client-foldkit/src/features/theme.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/compose.ts",
        contents: template("./client-foldkit/src/lib/compose.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/styles.css",
        contents: template("./client-foldkit/src/styles.css"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/vite.config.ts",
        contents: template("./client-foldkit/vite.config.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.config.json",
        contents: template("./client-foldkit/tsconfig.config.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./client-foldkit/tsconfig.json"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "vite build",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "vite --host --port 5174 --clearScreen false",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run --passWithNoTests",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "preview",
        value: "vite preview",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
  },

  {
    kind: "server",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Server Application",
    description: "An Effect HTTP API server",
    defaultName: "api",
    requiredModules: ["server-http-api"],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./server/package.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./server/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./server/tsconfig.json"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}esbuild{{/if}}",
        value: "^0.27.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}tsx{{/if}}",
        value: "^4.20.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value:
          "{{#if runtime=bun}}bun build src/index.ts --outdir=dist --target=bun --minify{{/if}}{{#if runtime=node}}esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js{{/if}}{{#if runtime=deno}}deno compile --allow-env --allow-net --allow-read --allow-write --allow-ffi --output dist/{{packageName}} src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build:types",
        value: "tsc --emitDeclarationOnly",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value:
          "{{#if runtime=bun}}bun run src/index.ts{{/if}}{{#if runtime=node}}tsx src/index.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-net --allow-read --allow-write src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev:watch",
        value:
          "{{#if runtime=bun}}bun --watch run src/index.ts{{/if}}{{#if runtime=node}}tsx watch src/index.ts{{/if}}{{#if runtime=deno}}deno run --watch --allow-env --allow-net --allow-read --allow-write src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run --passWithNoTests",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
  },

  {
    kind: "server-mcp",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "MCP Server Application",
    description:
      "A Model Context Protocol server with composable tools, prompts, and resources",
    defaultName: "",
    requiredModules: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./server-mcp/package.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./server-mcp/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./server-mcp/tsconfig.json"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}esbuild{{/if}}",
        value: "^0.27.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}tsx{{/if}}",
        value: "^4.20.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value:
          "{{#if runtime=bun}}bun build src/index.ts --outdir=dist --target=bun --minify{{/if}}{{#if runtime=node}}esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js{{/if}}{{#if runtime=deno}}deno compile --allow-env --allow-net --allow-read --allow-write --output dist/{{packageName}} src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build:types",
        value: "tsc --emitDeclarationOnly",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value:
          "{{#if runtime=bun}}bun run src/index.ts{{/if}}{{#if runtime=node}}tsx src/index.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-net --allow-read --allow-write src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev:watch",
        value:
          "{{#if runtime=bun}}bun --watch run src/index.ts{{/if}}{{#if runtime=node}}tsx watch src/index.ts{{/if}}{{#if runtime=deno}}deno run --watch --allow-env --allow-net --allow-read --allow-write src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run --passWithNoTests",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "{{#if runtime=bun}}inspector{{/if}}{{#if runtime=node}}inspector{{/if}}",
        value: "bun run dev & sleep 2 && npx @mcpjam/inspector@latest; kill %1",
      },
    ],
    nextSteps: [
      "MCP Server: run `{{#if runtime=deno}}deno task --filter {{packageName}} dev{{/if}}{{#if runtime=bun}}bun dev --filter={{packageName}}{{/if}}{{#if runtime=node}}bun dev --filter={{packageName}}{{/if}}` and connect an MCP client to http://localhost:9009/mcp{{#if runtime=bun}}, or run `bun --filter={{packageName}} run inspector` to open MCPJam Inspector{{/if}}{{#if runtime=node}}, or run `bun --filter={{packageName}} run inspector` to open MCPJam Inspector{{/if}}.",
    ],
  },

  {
    kind: "cli",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "CLI Application",
    description: "A command-line interface application",
    defaultName: "app",
    requiredModules: ["cli-command-hello"],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./cli/package.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: template("./cli/src/index.ts"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./cli/tsconfig.json"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}esbuild{{/if}}",
        value: "^0.27.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if runtime=node}}tsx{{/if}}",
        value: "^4.20.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value:
          "{{#if runtime=bun}}bun build src/index.ts --outdir=dist --target=bun --minify{{/if}}{{#if runtime=node}}esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js{{/if}}{{#if runtime=deno}}deno compile --allow-env --allow-net --allow-read --allow-write --output dist/{{packageName}} src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build:types",
        value: "tsc --emitDeclarationOnly",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value:
          "{{#if runtime=bun}}bun --watch run src/index.ts{{/if}}{{#if runtime=node}}tsx watch src/index.ts{{/if}}{{#if runtime=deno}}deno run --watch --allow-env --allow-net --allow-read --allow-write src/index.ts{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run --passWithNoTests",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
  },

  {
    kind: "package",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Shared Package",
    description: "A shared library package for code reuse across targets",
    visibility: "internal",
    requiredModules: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: template("./package/package.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: template("./package/tsconfig.json"),
        conflictOnModify: true,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value:
          "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
      },
    ],
  },
]);
