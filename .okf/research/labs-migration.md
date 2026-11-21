---
type: Research Report
title: Candidates for the Labs catalog
description: Initial review of official definitions that might fit an opt-in catalog and the dependencies that constrain migration.
status: draft
sources:
  - id: alchemy
    resource: ../../catalogs/official/src/modules/alchemy.ts
  - id: react
    resource: ../../catalogs/official/src/modules/client.ts
  - id: foldkit
    resource: ../../catalogs/official/src/modules/client-foldkit.ts
  - id: ai
    resource: ../../catalogs/official/src/modules/packages.ts
  - id: cli
    resource: ../../catalogs/official/src/modules/cli.ts
  - id: server
    resource: ../../catalogs/official/src/modules/server.ts
  - id: ids
    resource: ../../apps/docs/test/fixtures/published-catalog-ids.json
  - id: pilot
    resource: https://github.com/lloydrichards/stack-effect/issues/352
---

# Candidates for the Labs catalog

The initial implementation started with PersistedQueue on the official CLI target. The next iteration moved Browser Web Worker, Managed Chat Runtime, and WebFetch Toolkit to Labs under their existing IDs. See the [catalog distribution decision](../architecture/catalog-distribution.md) for the migration. The first audit looks for examples with platform-specific dependencies, optional provider integrations, or a narrower audience than the core scaffold. These signals indicate candidates for review. They are not upstream stability guarantees.

| Candidate | Why review it | What constrains a move |
| --- | --- | --- |
| `workspace-alchemy-cafe` and optional `alchemy-*` modules | A deployment example combines Alchemy, a website, and a Cloudflare Worker. | The preset expands to multiple target modules. Audit the related Worker HTTP client variants too. Some declare conflicts with core client integrations, and v1 prohibits cross-source conflicts. |
| `package-ai-toolkit-memory`, `package-ai-toolkit-plan`, `package-ai-toolkit-webfetch`, and `server-chat-runtime-managed` | The tool examples and alternate runtime composition are narrower than the shared AI package. | The managed runtime depends on official chat RPC and its domain contract, so a new variant could build on core. The three tool modules are optional children of `package-ai-chat-service`. Moving them alone would leave references in official, which cannot depend on Labs. |
| `client-react-web-worker` | The example demonstrates one browser-specific integration and offers a reference for new Labs worker experiments. | The published ID is now available from Labs. Evaluate SharedMemory as a new opt-in module with its own browser and Effect version requirements. |
| `client-foldkit` and `cloudflare-worker` target kinds | They exercise framework or deployment-specific choices. | Both are already used by official recipes. Moving a target would affect every module and saved recipe that selects it. Evaluate optional features first. |

Keep the workspace defaults, base CLI, server, and library targets, and shared HTTP, RPC, and database modules in core while Labs depends on them. Framework-specific targets may also remain in core if they form part of the compatibility promise.

Before moving any published ID, check the published ID inventory and trace target requirements, module dependencies, child selections, and conflicts. Test official-only projects, projects that select Labs and official, and transitions in which either document comes from cache. The current move uses an explicit Labs source migration for projects that reference these IDs. See [catalog distribution](../architecture/catalog-distribution.md) and the [catalog source contract](../domain/catalog-sources.md).
