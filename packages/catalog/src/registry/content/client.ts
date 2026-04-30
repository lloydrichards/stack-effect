export const configTypescriptViteContents = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "display": "Vite React",
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "jsx": "react-jsx",
    "noEmit": true,
    "incremental": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vite/client"]
  }
}
`;

export const clientPackageJsonContents = `{
  "name": "{{targetName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "clsx": "^2.1.1",
    "effect": "4.0.0-beta.59",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwind-merge": "^3.3.1",
    "tailwindcss": "^4.1.13"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@repo/config-typescript": "workspace:*",
    "@tailwindcss/vite": "^4.1.13",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.1.0",
    "typescript": "6.0.2",
    "vite": "^8.0.10",
    "vitest": "^4.1.4"
  }
}
`;

export const clientTsconfigContents = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@repo/config-typescript/vite.json",
  "compilerOptions": {
    "outDir": "dist",
    "paths": {
      "@/*": ["./src/*"],
      "~/*": ["./public/*"]
    }
  },
  "references": [{ "path": "./tsconfig.config.json" }],
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist", "dist-node"]
}
`;

export const clientTsconfigConfigContents = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "composite": true,
    "types": ["bun", "vite/client"],
    "outDir": "dist-node"
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
`;

export const clientIndexHtmlContents = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{targetName}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

export const clientMainTsxContents = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
`;

export const clientAppTsxContents = `function App() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="font-bold text-4xl">{{targetName}}</h1>
    </div>
  );
}

export default App;
`;

export const clientViteConfigContents = `import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    strictPort: true,
    host: "127.0.0.1",
  },
});
`;

export const clientIndexCssContents = `@import "tailwindcss";

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.148 0.004 228.8);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.148 0.004 228.8);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.148 0.004 228.8);
  --primary: oklch(0.52 0.105 223.128);
  --primary-foreground: oklch(0.984 0.019 200.873);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.963 0.002 197.1);
  --muted-foreground: oklch(0.56 0.021 213.5);
  --accent: oklch(0.963 0.002 197.1);
  --accent-foreground: oklch(0.218 0.008 223.9);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.925 0.005 214.3);
  --input: oklch(0.925 0.005 214.3);
  --ring: oklch(0.723 0.014 214.4);
}

.dark {
  --background: oklch(0.148 0.004 228.8);
  --foreground: oklch(0.987 0.002 197.1);
  --card: oklch(0.218 0.008 223.9);
  --card-foreground: oklch(0.987 0.002 197.1);
  --popover: oklch(0.218 0.008 223.9);
  --popover-foreground: oklch(0.987 0.002 197.1);
  --primary: oklch(0.45 0.085 224.283);
  --primary-foreground: oklch(0.984 0.019 200.873);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.275 0.011 216.9);
  --muted-foreground: oklch(0.723 0.014 214.4);
  --accent: oklch(0.275 0.011 216.9);
  --accent-foreground: oklch(0.987 0.002 197.1);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.56 0.021 213.5);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

export const clientUtilsContents = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

export const clientAtomContents = `import { Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { Atom } from "effect/unstable/reactivity";

const ENABLE_DEVTOOLS = import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

const MainLayer = Layer.mergeAll(
  ENABLE_DEVTOOLS ? DevTools.layer() : Layer.empty,
);

export const runtime = Atom.runtime(MainLayer);
`;
