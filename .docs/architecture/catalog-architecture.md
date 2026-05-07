# Catalog Package Architecture

> Internal architecture documentation for `@repo/catalog`. For domain term
> definitions, see [DOMAIN_LEXICON.md](../DOMAIN_LEXICON.md).

## Overview

The catalog package is a **read-only registry** that defines what targets and
modules can exist, their compatibility, and dependency relationships. It
serves as the source of truth for the scaffold system's available capabilities.

**Package**: `@repo/catalog`  
**Single Export**: `CatalogService`  
**Role in Pipeline**: Provides lookup services consumed by BlueprintService and
PlanService

## Package Structure

```bash
packages/catalog/
└── src/
    ├── index.ts              # Public export (CatalogService only)
    ├── CatalogService.ts     # Service layer with lookup methods
    └── registry/
        ├── targetRegistry.ts # Target definitions
        ├── moduleRegistry.ts # Module definitions
        └── content/          # Template files with token placeholders
```

## Internal Entities

### CatalogService

The single public boundary for all catalog operations. Provides:

| Method                | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `getTarget`           | Look up a target definition by kind                |
| `getModule`           | Look up a module definition by ID                  |
| `isSupportedOn`       | Check if module can attach to a target identity    |
| `isImpliedByAny`      | Check if module is implied by any implication rule |
| `getImplications`     | Get all implied modules for given module set       |
| `getSupportedModules` | Get all modules supported on a target kind         |

Properties:

| Property      | Purpose                                     |
| ------------- | ------------------------------------------- |
| `targetKinds` | All available target kinds (excluding init) |
| `toGraph`     | Full catalog as a directed graph            |

### Target Registry

Defines 5 target kinds with their base contributions:

| Kind      | Purpose                | Key Contributions             |
| --------- | ---------------------- | ----------------------------- |
| `init`    | Project initialization | .gitignore, root package.json |
| `client`  | Client application     | React app, Vite config        |
| `server`  | Server application     | Bun HTTP server               |
| `cli`     | CLI application        | Effect CLI entrypoint         |
| `package` | Shared package         | tsconfig, scripts             |

### Module Registry

Defines modules organized by category:

- **Init modules**: turbo, biome, vitest (supported on `init` target)
- **Client modules**: http-api-client, http-rpc-client, chat-client,
  ws-presence-client (supported on `client` target, imply server counterparts)
- **Server modules**: http-api-server, http-rpc-server, chat-server,
  ws-presence-server (supported on `server` target)
- **Domain modules**: domain-api, domain-rpc, domain-chat, domain-websocket
  (supported on `package/domain` identity)
- **Infrastructure modules**: ai, ai-sample-toolkit, ai-chat-service, presence
  (supported on specific package identities)

### Content Templates

Template files in `content/` use a token substitution system:

| Token                    | Resolves To                        |
| ------------------------ | ---------------------------------- |
| `{{targetPath}}`         | Target's filesystem path           |
| `{{targetDir}}`          | Alias for targetPath               |
| `{{targetKind}}`         | Target kind (client, server, etc.) |
| `{{targetName}}`         | Target name (or kind if empty)     |
| `{{runtime}}`            | "bun" or "node"                    |
| `{{packageManager}}`     | "bun", "npm", or "pnpm"            |
| `{{packageManagerSpec}}` | Full spec (e.g., "bun@1.2.21")     |
| `{{projectName}}`        | Project name from config           |

Templates are organized by target type (init.ts, client.ts, server.ts) and
feature (api.ts, rpc.ts, chat.ts, websocket.ts, ai.ts, presence.ts).

## Entity Relationships

```mermaid
erDiagram
    TargetDefinition {
        TargetKind kind PK
        string title
        string description
        ModuleId[] requiredModules
    }

    ModuleDefinition {
        ModuleId id PK
        string title
        string description
    }

    SupportedOn {
        string _tag "kind | identity"
        TargetKind kind "optional"
        TargetIdentity identity "optional"
    }

    ModuleImplication {
        TargetKind targetKind
        ModuleId moduleId
    }

    DesiredContributions {
        FileContribution[] files
        ExportContribution[] exports
        DependencyContribution[] dependencies
        ScriptContribution[] scripts
        BarrelExport[] barrelExports
        TsconfigContribution[] tsconfigs
    }

    TargetDefinition ||--|| DesiredContributions : "contributions"
    ModuleDefinition ||--|| DesiredContributions : "contributions"
    ModuleDefinition ||--o{ SupportedOn : "supportedOn"
    ModuleDefinition ||--o{ ModuleDefinition : "dependencies"
    ModuleDefinition ||--o{ ModuleImplication : "implies"
```

## Catalog Graph Structure

The `CatalogService.toGraph` property exposes the full catalog as a directed
graph using Effect's Graph module:

```mermaid
graph TB
  classDef target fill:#6cc5b0,color:#000
  classDef module fill:#efb116,color:#000

  T1[Target: init]:::target
  T2[Target: client]:::target
  T3[Target: server]:::target
  T4[Target: package]:::target
  M1[Module: turbo]:::module
  M2[Module: http-api-client]:::module
  M3[Module: http-api-server]:::module
  M4[Module: domain-api]:::module

  M1 -->|supportedOn| T1
  M2 -->|supportedOn| T2
  M3 -->|supportedOn| T3
  M4 -->|supportedOn| T4
  M2 -->|implies| M3
  M3 -->|requiredModule| M4
  M2 -->|requiredModule| M4
```

**Node Types**:

- `{_tag: "target", definition: TargetDefinition}`
- `{_tag: "module", definition: ModuleDefinition}`

**Edge Types**:

- `supportedOn`: Module can attach to target
- `requiredModule`: Module depends on another module
- `implies`: Module implies another module on a different target

## Dependency Chains

Client modules that imply server counterparts create cross-target dependency
chains:

```mermaid
flowchart LR
    subgraph Client Target
        A[chat-client]
    end

    subgraph Domain Package
        B[domain-chat]
    end

    subgraph AI Package
        C[ai-chat-service]
        D[ai-sample-toolkit]
    end

    subgraph Server Target
        E[chat-server]
    end

    A -->|implies| E
    A -->|requires| B
    E -->|requires| B
    E -->|requires| C
    C -->|requires| B
    C -->|requires| D
```

## Integration Points

The catalog is consumed by:

1. **BlueprintService** (scaffold): Validates selections and resolves
   dependencies using `getModule`, `isSupportedOn`, `getImplications`
2. **ContributionResolver** (scaffold): Looks up contributions and resolves
   tokens using `getTarget`, `getModule`
3. **CLI graph command**: Visualizes the catalog using `toGraph`

## Invariants

- Catalog data is immutable at runtime
- A module can only attach to targets matching its `supportedOn` rules
- Module dependencies reference existing modules (validated by tests)
- Module implications reference existing modules (validated by tests)
- All module IDs are unique across the registry
