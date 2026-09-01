// -- bootstrap ---------------------------------------------------------

export const gitignoreContents = `# dependencies
node_modules{{#if monorepo=vite-plus}}
node_modules/.vite/task-cache{{/if}}

# build
dist
build
.cache
{{#if monorepo=turbo}}.turbo
{{/if}}{{#if monorepo=vite-plus}}.turbo
{{/if}}{{#if monorepo=nx}}.nx/cache
.nx/workspace-data
{{/if}}tsconfig.tsbuildinfo

# env
.env
.env.local
.env.*.local

# ide
.idea
*.swp
*.swo

# os
.DS_Store
Thumbs.db

# test
coverage
playwright-report
test-results

# nix
result
result-*
.direnv/
`;

export const rootPackageJsonContents = `{
  "name": "{{targetName}}",
  "private": true,
  "type": "module",
  "packageManager": "{{packageManagerSpec}}",
  "scripts": {},
  "devDependencies": {},
  "engines": {
    "node": ">=24"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
`;

export const rootTsconfigContents = `{
  "$schema": "{{#if typescript=6}}./node_modules/@effect/language-service/schema.json{{/if}}{{#if typescript=7}}./node_modules/@effect/tsgo/schema.json{{/if}}",
  "extends": "./packages/config-typescript/base.json",
  "files": []{{#if typescript=7}},
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service"
      }
    ]
  }{{/if}}
}
`;

export const pnpmWorkspaceContents = `packages:
  - "apps/*"
  - "packages/*"

allowBuilds:
  esbuild: true
  msgpackr-extract: true{{#if monorepo=nx}}
  nx: true{{/if}}
`;

export const configTypescriptBaseContents = `{
  "$schema": "{{#if typescript=6}}../../node_modules/@effect/language-service/schema.json{{/if}}{{#if typescript=7}}../../node_modules/@effect/tsgo/schema.json{{/if}}",
  "display": "Default",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2023"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "useDefineForClassFields": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "inlineSources": false,
    "preserveWatchOutput": true,
    "removeComments": false,
    "sourceMap": true,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": false,
    "skipLibCheck": true,
    "plugins": [
      {
        "name": "@effect/language-service",
        "barrelImportPackages": ["effect"],
        "includeSuggestionsInTsc": true,
        "quickinfoMaximumLength": 1200,
        "diagnosticSeverity": {
          "cryptoRandomUUIDInEffect": "suggestion",
          "globalDateInEffect": "suggestion",
          "layerMergeAllWithDependencies": "warning",
          "missingEffectServiceDependency": "warning"
        }
      }
    ]
  },
  "exclude": ["node_modules", "dist", "build", ".next", "coverage"]
}
`;

export const configTypescriptPackageJsonContents = `{
  "name": "@repo/config-typescript",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
}
`;

// -- turbo ------------------------------------------------------------------

export const turboJsonContents = `{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "type-check": {
      "dependsOn": ["^type-check"]
    },
    "test": {
      "dependsOn": ["^test"]
    },
    "clean": {
      "cache": false
    }
  }
}
`;

// -- nx ---------------------------------------------------------------------

// HACK: Nx 23.1.1 cannot parse Bun 1.4's lockfile version 2. Bun recipes hash
// the lockfile through sharedGlobals instead; remove when Nx accepts version 2.
// Nx source analysis imports TypeScript's JavaScript API, which native TS7 does
// not expose. Generated projects declare cross-project dependencies in package
// manifests, so Nx can build the project graph without source analysis.
export const nxJsonContents = `{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "pluginsConfig": {
    "@nx/js": {
      "analyzeSourceFiles": false{{#if runtime=bun}},
      "analyzeLockfile": false{{/if}}
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "sharedGlobals": [
      "{workspaceRoot}/package.json",
      "{workspaceRoot}/bun.lock",
      "{workspaceRoot}/bun.lockb",
      "{workspaceRoot}/package-lock.json",
      "{workspaceRoot}/npm-shrinkwrap.json",
      "{workspaceRoot}/pnpm-lock.yaml",
      "{workspaceRoot}/pnpm-lock.yml",
      "{workspaceRoot}/pnpm-workspace.yaml",
      "{workspaceRoot}/scripts/hash-env.mjs",
      { "runtime": "node ./scripts/hash-env.mjs" }
    ]
  },
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["default", "^default"],
      "outputs": ["{projectRoot}/dist"]
    },
    "dev": {
      "cache": false,
      "continuous": true
    },
    "type-check": {
      "cache": true,
      "dependsOn": ["^type-check"],
      "inputs": ["default", "^default"]
    },
    "test": {
      "cache": true,
      "dependsOn": ["^test"],
      "inputs": ["default", "^default"]
    },
    "clean": {
      "cache": false
    }
  }
}
`;

export const nxHashEnvContents = `import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const workspaceRoot = process.cwd();
const workspaceDirectories = ["apps", "packages"];

const isEnvironmentFile = (name) =>
  name === ".env" || name.startsWith(".env.") || name.endsWith(".env");

const readDirectoryIfPresent = (path) =>
  readdir(path, { withFileTypes: true }).catch((error) => {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  });

const childDirectories = async (path) =>
  (await readDirectoryIfPresent(path))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const projectRoots = (
  await Promise.all(
    workspaceDirectories.map(async (directory) =>
      (await childDirectories(join(workspaceRoot, directory))).map((name) =>
        join(workspaceRoot, directory, name),
      ),
    ),
  )
).flat();

const environmentFiles = (
  await Promise.all(
    [workspaceRoot, ...projectRoots].map(async (projectRoot) =>
      (await readDirectoryIfPresent(projectRoot))
        .filter((entry) => entry.isFile() && isEnvironmentFile(entry.name))
        .map((entry) => join(projectRoot, entry.name)),
    ),
  )
).flat();

const hash = createHash("sha256");

const environmentFileContents = await Promise.all(
  environmentFiles.sort().map(async (path) => [path, await readFile(path)]),
);

environmentFileContents.forEach(([path, contents]) => {
  hash.update(relative(workspaceRoot, path));
  hash.update("\\0");
  hash.update(contents);
  hash.update("\\0");
});

process.stdout.write(hash.digest("hex"));
`;

// -- vite+ ------------------------------------------------------------------

export const vitePlusConfigContents = `import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
  },
});
`;

// -- biome ------------------------------------------------------------------

export const biomeJsoncContents = `{
  "$schema": "https://biomejs.dev/schemas/2.5.2/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  }{{#if format=biome}},
  "formatter": {
    "enabled": true,
    "indentStyle": "space"
  }{{/if}},
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "suspicious": {
        "noShadowRestrictedNames": "off",
        "noUnknownAtRules": "off"
      }
    }
  }{{#if format=biome}},
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  }{{/if}},
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
`;

export const workspaceVscodeSettingsContents = `{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"{{#if lint=biome}},
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit"
  }{{/if}},
  "[javascript]": {
    "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"
  },
  "[typescript]": {
    "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"
  },
  "[json]": {
    "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"
  },
  "[jsonc]": {
    "editor.defaultFormatter": "{{#if format=biome}}biomejs.biome{{/if}}{{#if format=dprint}}dprint.dprint{{/if}}{{#if format=oxfmt}}oxc.oxc-vscode{{/if}}"
  }{{#if typescript=7}},
  "js/ts.tsdk.additionalLocations": ["./node_modules/typescript/bin"],
  "js/ts.tsdk.promptToUseWorkspaceVersion": true,
  "js/ts.tsdk.path": "./node_modules/typescript/bin",
  "js/ts.experimental.useTsgo": true{{/if}}
}
`;

// -- oxfmt ------------------------------------------------------------------

export const oxfmtJsoncContents = `{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "sortImports": false,
  "sortTailwindcss": false,
  "sortPackageJson": false,
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/generated/**",
    "**/.cache/**",
    "**/.turbo/**"
  ]
}
`;

export const oxfmtVscodeExtensionsContents = `{
  "recommendations": ["oxc.oxc-vscode"]
}
`;

// -- dprint -----------------------------------------------------------------

export const dprintJsonContents = `{
  "$schema": "https://dprint.dev/schemas/v0.json",
  "includes": ["**/*.{ts,tsx,js,jsx,json,md}"],
  "indentWidth": 2,
  "lineWidth": 120,
  "newLineKind": "lf",
  "typescript": {
    "semiColons": "asi",
    "quoteStyle": "alwaysDouble",
    "trailingCommas": "never",
    "operatorPosition": "maintain",
    "arrowFunction.useParentheses": "force"
  },
  "excludes": [
    "**/dist",
    "**/build",
    "**/node_modules",
    "**/coverage",
    "**/.turbo",
    "**/.cache"
  ],
  "plugins": [
    "https://plugins.dprint.dev/typescript-0.93.4.wasm",
    "https://plugins.dprint.dev/markdown-0.20.0.wasm",
    "https://plugins.dprint.dev/json-0.21.1.wasm"
  ]
}
`;

// -- vitest -----------------------------------------------------------------

export const vitestConfigContents = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "e2e/**",
        "**/*.config.*",
        "**/*.d.ts",
        "**/types/**",
      ],
    },
  },
});
`;

// -- nix flake --------------------------------------------------------------

export const flakeNixContents = `{
  description = "{{projectName}} development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              {{#if runtime=bun}}bun
              {{/if}}nodejs_22
              git
            ];

            shellHook = ''
              {{#if runtime=bun}}echo "Bun $(bun --version)"
              {{/if}}echo "Node $(node --version)"
            '';
          };
        }
      );
    };
}
`;

export const envrcContents = `use flake
`;

// -- devcontainer -----------------------------------------------------------

export const devcontainerJsonContents = `{
  "name": "{{projectName}}",
  "image": "mcr.microsoft.com/devcontainers/typescript-node",

  "features": {
    "ghcr.io/shyim/devcontainers-features/bun:0": {}
  },

  "postCreateCommand": "{{packageManager}} install",

  "customizations": {
    "vscode": {
      "settings": {
        "editor.formatOnSave": true{{#if format=biome}},
        "editor.defaultFormatter": "biomejs.biome"{{/if}}{{#if format=dprint}},
        "editor.defaultFormatter": "dprint.dprint"{{/if}}{{#if format=oxfmt}},
        "editor.defaultFormatter": "oxc.oxc-vscode"{{/if}}
      },
      "extensions": [
        {{#if lint=biome}}"biomejs.biome",
        {{/if}}{{#if format=biome}}"biomejs.biome",
        {{/if}}{{#if lint=oxlint}}"oxlint.oxlint-vscode",
        {{/if}}{{#if format=dprint}}"dprint.dprint",
        {{/if}}{{#if format=oxfmt}}"oxc.oxc-vscode",
        {{/if}}{{#if runtime=bun}}"oven.bun-vscode",
        {{/if}}"effectful-tech.effect-vscode",
        "YoavBls.pretty-ts-errors"
      ]
    }
  }
}
`;
