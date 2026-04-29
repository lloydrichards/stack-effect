---
name: create-module
description: Create new scaffold modules for the CLI catalog from existing code or feature descriptions. Use this skill whenever the user wants to add a module to the catalog, extract a feature into a scaffoldable module, turn existing code into a template, create catalog entries, or mentions "module", "catalog", "scaffold module", or "add to catalog". Also triggers when the user asks to make a feature available via `stack-effect add`.
---

# Create Module

Turn existing features or new feature designs into scaffold modules for the CLI catalog. A module is a declarative recipe that tells the scaffold pipeline what files, dependencies, exports, and scripts to generate when a user runs `stack-effect add`.

## How modules work

The catalog system is purely declarative. A module is a static data structure — no imperative `contribute()` function. It declares:

- **What it produces**: files, package.json exports, dependencies, scripts, barrel exports, tsconfigs
- **Where it can be attached**: target kinds (server, client, package) or specific target identities
- **What it requires**: other targets and/or modules that must exist first

The scaffold pipeline resolves token placeholders (`{{targetPath}}`, `{{targetName}}`, etc.) at generation time, so all paths in a module definition use these tokens rather than hardcoded paths.

## Architecture: The vertical slice

Every feature in this stack follows a vertical slice pattern across up to 4 layers. Understanding which layers your feature touches determines which modules you need to create.

| Layer | Location | Module pattern | What it contains |
|-------|----------|---------------|-----------------|
| **Domain schema** | `packages/domain/src/` | `domain-*` | Schema definitions, RPC groups, branded types |
| **Server handler** | `apps/server-*/src/` | `*-server` | Effect service, RPC implementation, Layer composition |
| **Client service** | `apps/client-*/src/lib/` | `*-client` | RPC client, atoms, WebSocket client |
| **Client UI** | `apps/client-*/src/components/` | (part of `*-client`) | React components consuming atoms |

A full-stack feature typically produces 2-4 modules. For example, the RPC tick feature has: `domain-rpc` (schema) + `http-rpc-server` (handler) + `http-rpc-client` (atom + UI).

## Step-by-step workflow

### 1. Identify the source material

Determine what you're working from:

- **Existing code in the monorepo**: Read the actual source files and extract them into templates. This is the most reliable path because the code already works.
- **Feature description**: Design the schemas, handlers, and UI from scratch following established patterns.
- **Hybrid**: The user has partial code and wants to fill in the gaps.

### 2. Trace the vertical slice

For each feature, identify every file that participates and which layer it belongs to. Map the dependency graph — domain modules have no dependencies, server/client modules depend on domain modules, and some modules depend on other modules (e.g., `domain-chat` depends on `domain-rpc` because it extends the EventRpc group).

### 3. Plan the modules

Each module should be a cohesive unit that a user would want to add or skip independently. The guiding question: "Would someone ever want this layer without the others?" If a server handler is useless without its domain schema, the server module should declare a dependency on the domain module — the blueprint resolver will auto-create it.

Name modules consistently:
- Domain modules: `domain-{feature}` (e.g., `domain-rpc`, `domain-websocket`)
- Server modules: `{feature}-server` or `http-{protocol}-server` (e.g., `chat-server`, `ws-presence-server`)
- Client modules: `{feature}-client` or `http-{protocol}-client` (e.g., `chat-client`, `ws-presence-client`)

### 4. Create content templates

Each module's file contents live as exported string constants in `packages/catalog/src/registry/content/`. Group related templates by feature:

```
content/
├── rpc.ts          # domain-rpc schema + server tick handler
├── chat.ts         # domain-chat schema + server chat handler
├── websocket.ts    # domain-websocket schema + server presence handler
├── client-rpc.ts   # rpc-client service, tick atom, rpc card
├── client-chat.ts  # chat atom, chat box component
└── client-websocket.ts  # ws client, presence panel
```

When creating templates from existing code:

- Copy the source file content verbatim into a template string
- Replace hardcoded paths with `{{targetPath}}` tokens where appropriate (only in the module definition's `path` fields — not inside the file contents themselves)
- Escape backticks and `${...}` expressions in template literals (use `\`` and `\${...}`)
- Keep `import.meta.env` references as-is — they're resolved at runtime, not scaffold time
- Export each template as a named constant (e.g., `export const domainRpcContents = \`...\``)

### 5. Register the ModuleId

Add the new module ID to the `ModuleId` union in `packages/domain/src/Catalog.ts`:

```typescript
export const ModuleId = Schema.Union([
  // ... existing
  Schema.Literal("my-new-module"),
]);
```

### 6. Add the module definition

Add the module to the `moduleRegistry` array in `packages/catalog/src/registry/moduleRegistry.ts`. Here's the anatomy of a definition:

```typescript
{
  id: "my-new-module",
  title: "Human-Readable Title",
  description: "What this module scaffolds",
  supportedOn: [
    // Option A: any target of a kind
    { _tag: "kind", kind: "server" },
    // Option B: one specific target
    { _tag: "identity", identity: new TargetIdentity({ kind: "package", name: "domain" }) },
  ],
  dependencies: [
    // Require a target to exist (auto-created if missing)
    {
      requiredTarget: {
        identity: new TargetIdentity({ kind: "package", name: "domain" }),
      },
    },
    // Require a specific module on a target
    {
      requiredTarget: {
        identity: new TargetIdentity({ kind: "package", name: "domain" }),
      },
      requiredModule: {
        target: new TargetIdentity({ kind: "package", name: "domain" }),
        moduleId: "domain-api",
      },
    },
  ],
  contributions: {
    files: [
      { path: "{{targetPath}}/src/MyFeature.ts", contents: myFeatureContents },
    ],
    exports: [
      { path: "{{targetPath}}/package.json", name: "./MyFeature", value: "./src/MyFeature.ts" },
    ],
    dependencies: [
      { path: "{{targetPath}}/package.json", section: "dependencies", name: "@repo/domain", value: "workspace:*" },
    ],
    scripts: [],
    barrelExports: [
      { barrelPath: "{{targetPath}}/src/index.ts", exportPath: "./MyFeature" },
    ],
    tsconfigs: [],
  },
}
```

**Contribution types explained:**

| Slot | Merge behavior | When to use |
|------|---------------|-------------|
| `files` | Authoritative (whole-file write) | Source files, configs |
| `exports` | Structural merge into package.json `exports` | Domain packages with subpath exports |
| `dependencies` | Structural merge into package.json | npm/workspace deps |
| `scripts` | Structural merge into package.json | Build/dev/test commands |
| `barrelExports` | Appends `export * from "..."` to barrel file | Domain packages re-exporting from index.ts |
| `tsconfigs` | Authoritative (whole-file write) | TypeScript config files |

Use empty arrays `[]` for unused slots — every slot must be present.

### 7. Handle file conflicts

When two modules produce the same file (e.g., `domain-rpc` creates `Rpc.ts` with just tick, but `domain-chat` overwrites it with tick + chat), the later module's version wins. Design your content templates with this in mind — if module B extends module A's file, module B's template should include everything from A plus its additions. This is how `domain-chat` works: it provides a `Rpc.ts` that contains both the tick and chat RPC definitions.

### 8. Verify

After adding modules:

1. Run `bun run build` — confirms the registry compiles
2. Run `bun test` — confirms no regressions
3. Manually inspect the module definitions for correctness: paths use `{{targetPath}}`, dependencies point to valid module IDs, `supportedOn` matches the right target kinds

## Common patterns to follow

### Domain modules for packages/domain
- `supportedOn`: identity match to `{ kind: "package", name: "domain" }`
- Always include `exports` and `barrelExports` so the package re-exports the new schema
- No npm dependencies needed (Effect is already a dependency of the domain package)

### Server modules
- `supportedOn`: `{ _tag: "kind", kind: "server" }` (works on any server target)
- Declare dependency on the relevant domain module
- Include workspace deps like `@repo/ai` or `@repo/presence` if the handler needs them

### Client modules
- `supportedOn`: `{ _tag: "kind", kind: "client" }` (works on any client target)
- Declare dependency on the relevant domain module
- Always include `@repo/domain: workspace:*` in dependencies
- If the module provides an RPC client service, also provide an updated `atom.ts` that wires the service into the atom runtime layer
- WebSocket modules need `@effect/platform-browser` and an updated `vite-env.d.ts` with the `VITE_WS_URL` env var

## Checklist

Before considering a module complete:

- [ ] ModuleId added to `packages/domain/src/Catalog.ts`
- [ ] Content templates created in `packages/catalog/src/registry/content/`
- [ ] Module definition added to `packages/catalog/src/registry/moduleRegistry.ts`
- [ ] Imports added for all content template exports
- [ ] All contribution slots present (even if empty arrays)
- [ ] Paths use `{{targetPath}}` tokens
- [ ] Dependencies correctly reference existing ModuleIds and TargetIdentities
- [ ] `bun run build` passes
- [ ] `bun test` shows no new failures
