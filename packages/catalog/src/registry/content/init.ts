// -- bootstrap ---------------------------------------------------------

export const gitignoreContents = `# dependencies
node_modules

# build
dist
build
.cache
.turbo
tsconfig.tsbuildinfo

# env
.env
.env.local
.env.*.local

# ide
.idea
.vscode
*.swp
*.swo

# os
.DS_Store
Thumbs.db

# test
coverage
playwright-report
test-results
`;

export const rootPackageJsonContents = `{
  "name": "{{targetName}}",
  "private": true,
  "packageManager": "{{packageManagerSpec}}",
  "scripts": {},
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "typescript": "6.0.2"
  },
  "engines": {
    "node": ">=18"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
`;

export const rootTsconfigContents = `{
  "$schema": "./node_modules/@effect/language-service/schema.json",
  "extends": "./packages/config-typescript/base.json",
  "files": []
}
`;

export const configTypescriptBaseContents = `{
  "$schema": "../../node_modules/@effect/language-service/schema.json",
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

// -- biome ------------------------------------------------------------------

export const biomeJsoncContents = `{
  "$schema": "https://biomejs.dev/schemas/2.4.11/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noShadowRestrictedNames": "off",
        "noUnknownAtRules": "off"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
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
