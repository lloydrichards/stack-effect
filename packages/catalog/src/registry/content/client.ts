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
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "@base-ui/react": "^1.3.0",
    "@effect/atom-react": "4.0.0-beta.93",
    "@fontsource-variable/jetbrains-mono": "^5.2.5",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "effect": "4.0.0-beta.93",
    "lucide-react": "^1.0.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "shadcn": "^4.1.0",
    "tailwind-merge": "^3.3.1",
    "tailwindcss": "^4.1.13",
    "tw-animate-css": "^1.4.0"
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

export const clientAppTsxContents = `import { ThemeToggle } from "./components/theme-toggle";

function App() {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 p-4">
      <ThemeToggle />

      <div className="text-center">
        <h1 className="font-black text-5xl">{{targetName}}</h1>
        <p className="text-muted-foreground">A typesafe fullstack monorepo</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 auto-rows-[30rem] lg:auto-rows-[22rem] lg:grid-cols-2">
        {/* @slot:components */}
      </div>
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
  optimizeDeps: {
    include: ["@repo/domain"],
  },
  server: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
  },
});
`;

export const clientShadcnComponentJson = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-lyra",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "mist",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}`;

export const clientIndexCssContents = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/jetbrains-mono";

@custom-variant dark (&:is(.dark *));

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
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --font-heading: var(--font-mono);
  --font-mono: "JetBrains Mono Variable", monospace;
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
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
  --chart-1: oklch(0.823 0.12 346.018);
  --chart-2: oklch(0.656 0.241 354.308);
  --chart-3: oklch(0.592 0.249 0.584);
  --chart-4: oklch(0.525 0.223 3.958);
  --chart-5: oklch(0.459 0.187 3.815);
  --sidebar: oklch(0.987 0.002 197.1);
  --sidebar-foreground: oklch(0.148 0.004 228.8);
  --sidebar-primary: oklch(0.609 0.126 221.723);
  --sidebar-primary-foreground: oklch(0.984 0.019 200.873);
  --sidebar-accent: oklch(0.963 0.002 197.1);
  --sidebar-accent-foreground: oklch(0.218 0.008 223.9);
  --sidebar-border: oklch(0.925 0.005 214.3);
  --sidebar-ring: oklch(0.723 0.014 214.4);
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
  --chart-1: oklch(0.823 0.12 346.018);
  --chart-2: oklch(0.656 0.241 354.308);
  --chart-3: oklch(0.592 0.249 0.584);
  --chart-4: oklch(0.525 0.223 3.958);
  --chart-5: oklch(0.459 0.187 3.815);
  --sidebar: oklch(0.218 0.008 223.9);
  --sidebar-foreground: oklch(0.987 0.002 197.1);
  --sidebar-primary: oklch(0.715 0.143 215.221);
  --sidebar-primary-foreground: oklch(0.302 0.056 229.695);
  --sidebar-accent: oklch(0.275 0.011 216.9);
  --sidebar-accent-foreground: oklch(0.987 0.002 197.1);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.56 0.021 213.5);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-mono;
  }
}
`;

export const clientAtomContents = `import { Layer } from "effect";
import { Atom } from "effect/unstable/reactivity";

// NOTE: Modules append additional runtime layers through Layer.mergeAll.
const RuntimeLayer = Layer.mergeAll(Layer.empty);

export const runtime = Atom.runtime(RuntimeLayer);
`;

export const clientDevToolsContents = `import { Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";

export const DevToolsLive =
  import.meta.env.VITE_ENABLE_DEVTOOLS === "true"
    ? DevTools.layer(
        import.meta.env.VITE_DEVTOOLS_URL || "ws://localhost:34437",
      )
    : Layer.empty;
`;

export const clientThemeToggleContents = `import { useLayoutEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Switch } from "./ui/switch";

export const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  useLayoutEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const shouldUseDark = storedTheme ? storedTheme === "dark" : prefersDark;

    document.documentElement.classList.toggle("dark", shouldUseDark);
    setIsDark(shouldUseDark);
  }, []);

  const handleThemeToggle = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    localStorage.setItem("theme", nextIsDark ? "dark" : "light");
  };
  return (
    <Card className="absolute right-4 top-4" size="sm">
      <CardContent className="gap-2 flex items-center justify-between">
        <label htmlFor="theme-toggle">Theme</label>
        <Switch
          id="theme-toggle"
          checked={isDark}
          onCheckedChange={handleThemeToggle}
        />
      </CardContent>
    </Card>
  );
};
`;

export const clientUtilsContents = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

export const clientViteEnvContents = `/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_DEVTOOLS: string;
  readonly VITE_DEVTOOLS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`;
