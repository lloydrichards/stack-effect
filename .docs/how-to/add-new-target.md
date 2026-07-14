# How to Add a New Target

This guide walks through adding a new target kind to the scaffold catalog.

## Prerequisites

- Familiarity with the catalog package structure (`packages/catalog/src/`)
- Understanding of [TargetDefinition](../DOMAIN_LEXICON.md#targetdefinition)
  and [TargetIdentity](../DOMAIN_LEXICON.md#targetidentity) concepts
- A clear idea of the workspace structure the target should produce

## Step 1: Register the Target Kind

The `TargetKind` schema in `packages/domain/src/Catalog.ts` uses a union
that accepts any string as a valid kind. Built-in kinds (`workspace`, `package`)
have special path derivation rules; custom kinds use the default `apps/`
convention.

No schema changes are required for new kinds. The kind is registered
implicitly when you add the target definition in Step 3.

## Step 2: Create Content Templates

Create a new file in `packages/catalog/src/registry/content/` for your
target's templates:

```typescript
// packages/catalog/src/registry/content/worker.ts

export const workerIndexContents = `import { Effect } from "effect";

Effect.gen(function* () {
  yield* Effect.log("Worker started");
}).pipe(Effect.runPromise);
`;

export const workerTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}`;
```

Use contribution tokens for dynamic values:

| Token                | Resolves To                    |
| -------------------- | ------------------------------ |
| `{{targetPath}}`     | Target's filesystem path       |
| `{{targetName}}`     | Target name (or kind if empty) |
| `{{targetKind}}`     | Target kind                    |
| `{{runtime}}`        | "bun" or "node"                |
| `{{packageManager}}` | "bun", "npm", or "pnpm"        |
| `{{workspaceDependency}}` | Compatible local workspace dependency range |
| `{{projectName}}`    | Project name from config       |

## Step 3: Define the Target

Add an entry to `packages/catalog/src/registry/targetRegistry.ts`:

```typescript
import {
  workerIndexContents,
  workerTsconfigContents,
} from "./content/worker";

// In the targetRegistry array:
{
  kind: TargetKind.make("worker"),
  title: "Worker Application",
  description: "A background worker or job processor",
  requiredModules: [],
  contributions: {
    ...emptyDesiredContributions(),
    files: [
      {
        path: "{{targetPath}}/src/index.ts",
        contents: workerIndexContents,
      },
    ],
    scripts: [
      {
        path: "{{targetPath}}/package.json",
        name: "dev",
        value: "bun --watch run src/index.ts",
      },
      {
        path: "{{targetPath}}/package.json",
        name: "build",
        value: "bun build src/index.ts --outdir=dist --target=bun",
      },
      {
        path: "{{targetPath}}/package.json",
        name: "type-check",
        value: "tsc --noEmit",
      },
    ],
    tsconfigs: [
      {
        path: "{{targetPath}}/tsconfig.json",
        contents: workerTsconfigContents,
      },
    ],
  },
}
```

## Step 4: Configure Contributions

Target contributions define the base workspace scaffold:

| Contribution | Purpose                              |
| ------------ | ------------------------------------ |
| `files`      | Source files, configs, static assets |
| `scripts`    | package.json scripts                 |
| `tsconfigs`  | tsconfig.json contents               |

Targets typically do not use `exports`, `dependencies`, or `barrelExports`
directly. Those are usually added by modules attached to the target.

## Step 5: Add Required Modules (Optional)

If the target should always include certain modules, add them to
`requiredModules`:

```typescript
{
  kind: TargetKind.make("worker"),
  title: "Worker Application",
  description: "A background worker or job processor",
  requiredModules: [ModuleId.make("config-typescript-worker")],
  contributions: { /* ... */ },
}
```

These modules are automatically included in the blueprint when the target
is selected.

## Step 6: Understand Path Conventions

The `TargetIdentity` class in `packages/domain/src/Catalog.ts` derives
paths from the target kind and name:

| Kind      | Identity Example               | Derived Path            |
| --------- | ------------------------------ | ----------------------- |
| `workspace` | `{ kind: "workspace", name: "root" }` | `.`                   |
| `package` | `{ kind: "package", name: "domain" }` | `packages/domain` |
| `server`  | `{ kind: "server", name: "api" }` | `apps/server-api`    |
| `client`  | `{ kind: "client", name: "web" }` | `apps/client-web`    |
| `worker`  | `{ kind: "worker", name: "jobs" }` | `apps/worker-jobs`  |

Custom kinds follow the pattern: `apps/{kind}-{kebab-case-name}`

If your target requires a different path convention, you must modify the
`toPath()` and `toKey()` methods in `TargetIdentity`.

## Step 7: Verify

Run the validation suite:

```bash
bun run test --filter=catalog
bun run type-check
bun lint
```

Test the new target with the CLI:

```bash
# View the catalog graph
bun run start -- graph

# Test scaffolding (dry run)
TMP_REPO="$(mktemp -d)"
trap 'rm -rf "$TMP_REPO"' EXIT
bun run start -- init test-app --yes --root "$TMP_REPO"
bun run start -- add --yes --root "$TMP_REPO" --target worker/jobs --dry-run
```

## Troubleshooting

### Target not appearing in CLI

Verify the target is added to `targetRegistry` array and the file is
properly imported. Check for TypeScript errors.

### Path derivation is wrong

Custom kinds use `apps/{kind}-{name}`. If you need a different convention,
modify `TargetIdentity.toPath()` in `packages/domain/src/Catalog.ts`.

### Modules cannot attach to the new target

Ensure modules have `supportedOn` rules that match your target kind:

```typescript
supportedOn: [
  { _tag: "kind", kind: TargetKind.make("worker") }
]
```

### Type errors in targetRegistry.ts

Use `emptyDesiredContributions()` from `@repo/domain/Scaffold` as a base
and spread it to ensure all required fields are present:

```typescript
import { emptyDesiredContributions } from "@repo/domain/Scaffold";

contributions: {
  ...emptyDesiredContributions(),
  files: [ /* your files */ ],
}
```

### "CatalogNotFound" when using requiredModules

The module ID in `requiredModules` must exist in the module registry.
Check spelling and ensure the module is defined.
