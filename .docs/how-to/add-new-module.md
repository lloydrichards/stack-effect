# How to Add a New Module

This guide walks through adding a new module to the scaffold catalog.

## Prerequisites

- Familiarity with the catalog package structure (`packages/catalog/src/`)
- Understanding of [Module](../DOMAIN_LEXICON.md#moduledefinition) and
  [SupportedOn](../DOMAIN_LEXICON.md#supportedon) concepts
- A clear idea of which target(s) the module should attach to

## Step 1: Create the Content Template

Create a new file or add to an existing file in
`packages/catalog/src/registry/content/`.

```typescript
// packages/catalog/src/registry/content/my-feature.ts

export const myFeatureContents = `import { Effect } from "effect";

export const MyFeature = {
  // Your feature implementation
};
`;
```

Use contribution tokens for dynamic values:

| Token                    | Resolves To                    |
| ------------------------ | ------------------------------ |
| `{{targetPath}}`         | Target's filesystem path       |
| `{{targetName}}`         | Target name (or kind if empty) |
| `{{targetKind}}`         | Target kind                    |
| `{{runtime}}`            | "bun" or "node"                |
| `{{packageManager}}`     | "bun", "npm", or "pnpm"        |
| `{{packageManagerSpec}}` | Full spec (e.g., "bun@1.2.21") |
| `{{projectName}}`        | Project name from config       |
| `{{lint}}`               | Lint tool ("biome", "oxlint", or "") |
| `{{format}}`             | Format tool ("biome", "dprint", or "") |
| `{{test}}`               | Test framework ("vitest" or "") |
| `{{monorepo}}`           | Monorepo tool ("turbo" or "") |

### Conditional Blocks

Use conditionals to include content based on config values:

```typescript
// Truthy check - include if field has any value
{{#if lint}}
  // This content appears if any lint tool is configured
{{/if}}

// Equality check - include if field equals specific value
{{#if format=biome}}
  "editor.defaultFormatter": "biomejs.biome"
{{/if}}
```

**Notes:**
- Unknown fields silently evaluate as falsy
- Whitespace is preserved as-is (formatters clean up during finalize)
- For JSON arrays, place conditionals before required items to avoid trailing comma issues

## Step 2: Define the Module

Add an entry to `packages/catalog/src/registry/moduleRegistry.ts`:

```typescript
import { myFeatureContents } from "./content/my-feature";

// In the moduleRegistry array:
{
  id: ModuleId.make("my-feature"),
  title: "My Feature",
  description: "A brief description of what this module provides",
  supportedOn: [],      // Step 3
  dependencies: [],     // Step 4
  contributions: {},    // Step 5
}
```

## Step 3: Configure Compatibility

Set the `supportedOn` array to declare where the module can attach.

**Option A: Support on a target kind** (all targets of that kind)

```typescript
supportedOn: [
  { _tag: "kind", kind: TargetKind.make("server") }
]
```

**Option B: Support on a specific target identity**

```typescript
supportedOn: [
  {
    _tag: "identity",
    identity: new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "domain",
    }),
  }
]
```

## Step 4: Declare Dependencies

Add entries to the `dependencies` array for modules that require other
targets or modules to exist.

**Require a target to exist:**

```typescript
dependencies: [
  {
    requiredTarget: {
      identity: new TargetIdentity({
        kind: TargetKind.make("package"),
        name: "domain",
      }),
    },
  },
]
```

**Require a module on a target:**

```typescript
dependencies: [
  {
    requiredModule: {
      target: new TargetIdentity({
        kind: TargetKind.make("package"),
        name: "domain",
      }),
      moduleId: ModuleId.make("domain-api-contracts"),
    },
  },
]
```

**Require both a target and a module on it:**

```typescript
dependencies: [
  {
    requiredTarget: {
      identity: new TargetIdentity({
        kind: TargetKind.make("package"),
        name: "domain",
      }),
    },
    requiredModule: {
      target: new TargetIdentity({
        kind: TargetKind.make("package"),
        name: "domain",
      }),
      moduleId: ModuleId.make("domain-api-contracts"),
    },
  },
]
```

## Step 5: Add Contributions

Define what the module contributes to its owning target:

```typescript
contributions: {
  files: [
    {
      path: "{{targetPath}}/src/MyFeature.ts",
      contents: myFeatureContents,
    },
  ],
  exports: [
    {
      path: "{{targetPath}}/package.json",
      name: "./MyFeature",
      value: "./src/MyFeature.ts",
    },
  ],
  dependencies: [
    {
      path: "{{targetPath}}/package.json",
      section: "dependencies",
      name: "some-package",
      value: "^1.0.0",
    },
  ],
  scripts: [
    {
      path: "{{targetPath}}/package.json",
      name: "my-script",
      value: "echo 'Hello'",
    },
  ],
  barrelExports: [
    {
      barrelPath: "{{targetPath}}/src/index.ts",
      exportPath: "./MyFeature",
    },
  ],
  tsconfigs: [],
}
```

| Contribution     | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `files`          | New files to create                       |
| `exports`        | package.json exports entries              |
| `dependencies`   | package.json dependencies/devDependencies |
| `scripts`        | package.json scripts                      |
| `barrelExports`  | Re-export statements in barrel files      |
| `tsconfigs`      | tsconfig.json contents (usually targets)  |

## Step 6: Add Implications (Optional)

If selecting this module on one target should imply another module on a
different target kind, add the `implies` field:

```typescript
{
  id: ModuleId.make("client-react-http-api"),
  // ... other fields
  implies: [
    {
      targetKind: TargetKind.make("server"),
      moduleId: ModuleId.make("server-http-api"),
    },
  ],
}
```

This means: when `client-react-http-api` is selected on a client-react target, the
blueprint will also include `server-http-api` on any server target.

## Step 7: Add Children (Optional)

If this module should have sub-modules that appear nested in the selection UI,
add the `children` field. Children must be on the **same target** as the parent.

```typescript
{
  id: ModuleId.make("package-ai-chat-service"),
  // ... other fields
  children: [
    { moduleId: ModuleId.make("ai-sample-toolkit"), requirement: "optional" },
    { moduleId: ModuleId.make("ai-weather-toolkit"), requirement: "optional" },
  ],
}
```

**Requirement types:**

| Value      | Behavior                                              |
| ---------- | ----------------------------------------------------- |
| `required` | Auto-selected when parent selected, not user-toggleable |
| `optional` | User can toggle on/off when parent is selected        |

**Key points:**

- Children are a **UI concept only** - they don't affect Blueprint resolution
- Modules listed as children are **excluded from top-level** selection lists
- Children must share at least one `supportedOn` rule with their parent
- For cross-target relationships, use `dependencies` or `implies` instead

## Step 8: Verify

Run the validation suite:

```bash
bun run test --filter=catalog
bun run type-check
bun lint
```

The catalog tests validate:

- All module IDs are unique
- All dependency references point to existing modules
- All implication references point to existing modules

## Troubleshooting

### "CatalogNotFound" error

The module references a target kind or module ID that does not exist.
Check spelling in `dependencies`, `implies`, and `supportedOn`.

### Module not appearing in CLI

Verify the `supportedOn` rules match the target you are selecting. Use
`bun run start -- graph` to visualize the catalog.

### Contribution tokens not resolving

Ensure you use the exact token syntax: `{{tokenName}}`. Check
[CATALOG_ARCHITECTURE.md](../architecture/CATALOG_ARCHITECTURE.md#content-templates)
for the full token list.

### Type errors in moduleRegistry.ts

Ensure all required fields are present. Use `emptyDesiredContributions()`
from `@repo/domain/Scaffold` as a starting point if needed.
