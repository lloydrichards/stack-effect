---
type: Guide
title: Catalog authoring workflow
description: Edit generated files, validate them, and port the concrete diff back to the catalog.
status: stable
sources:
  - id: source-1
    resource: ../../.agents/skills/catalog-workspace/SKILL.md
  - id: source-2
    resource: ../../packages/domain/src/Scaffold.ts
  - id: source-3
    resource: ../../package.json
  - id: source-4
    resource: ../../catalogs/official/templates/package-db-todo-repository/src/TodoRepository.ts
  - id: source-5
    resource: ../../catalogs/official/templates/server-todo-repository/src/Services/TodoRepository.ts
  - id: source-6
    resource: ../../catalogs/official/templates/server-http-api-todos/src/Api/Todo.ts
  - id: source-7
    resource: ../../catalogs/official/templates/domain-todo-contracts/src/Todo.ts
  - id: source-8
    resource: ../../catalogs/official/templates/domain-todo-http-contracts/src/TodoApi.ts
generated: { by: codex, at: "2026-11-22T17:48:47+00:00" }
---

# Catalog authoring workflow

Generated file bodies live in `catalogs/official/templates/**` and `catalogs/labs/templates/**` as ordinary files, but tokens and `{{#if}}` blocks mean they are not checked in place. Follow the repository's catalog workspace skill at `.agents/skills/catalog-workspace/SKILL.md` before changing generated content. The definitions are built with the [catalog authoring package](../architecture/catalog-authoring-package.md "builds definitions with").

1. Run `bun run catalog:reset-workspace`. This replaces the disposable `workspace/catalog-built` directory, runs Finalize, and creates its internal baseline. Check for tracked edits and untracked files first. Save any work you need outside the generated directory before resetting.
2. Locate the generated file through source annotations or `.catalog-build-manifest.json`. Edit and check that real file first. For a new module or target, prototype its files in the generated workspace before adding the catalog definition.
3. Run `bun run catalog:validate-workspace` and inspect `bun run catalog:diff-workspace`. Check the generated workspace status for new files. Save the intended contents and expected deletions outside the generated directory.
4. Port the smallest validated change to its owning contribution or template file. A composed file may belong to several contributors; do not copy the entire result into one base template.
5. Reset again and compare the affected paths with the saved expectations. Reset creates a fresh baseline, so use the saved contents and expected deletions for the comparison. Run validation on the regenerated workspace.
6. Run `bun format`, `bun lint`, and `bun run type-check`. For catalog behavior changes, also run `bun run test --filter=@repo/catalog-official` and `bun run test --filter=stack-effect`, plus the relevant generated-project checks.

Reset can fail during dependency installation or a module finalizer. Resolve that failure before treating the workspace as a validated baseline. Do not commit `workspace/catalog-built` to the parent repository.

## Effect patterns in generated code

The Official Todo HTTP API with SQLite is the reference slice. Generate it with targets `server/api:server-http-api-todos` and `package/db:package-db-sqlite`. Read the generated Todo schema, repository, handlers, and server wiring together.

- Use a named `Context.Service` class with a static `.layer`. Declare the interface for reusable services. Infer private service shapes where that keeps the code clearer. Qualify new service IDs by owning package and keep existing IDs stable.
- Resolve reusable service dependencies when constructing its Layer. Supply platform Layers in the app. Use `Layer.provide` for implementation dependencies and `Layer.provideMerge` when downstream consumers also need the dependency. Give standalone Layers PascalCase role names, such as `TodoHandlers` and `TodoRoutes`. Add `Layer` where the role needs clarification.
- Use `Schema.Struct` with a derived type for ordinary records, branded schemas for IDs, and `Schema.Opaque` when the whole record requires a distinct construction boundary. Use tagged errors for expected failures. Translate infrastructure failures in the service and assign HTTP statuses in the HTTP contract.
- Resolve shared services when building handler groups. Resolve request-specific services inside the handler. Keep the default HTTP 400 for schema rejection. Use typed validation middleware when clients need a stable error body.
- Keep the main operation easy to read in order. Use collection operations when they make a transformation clearer. Keep short single-use logic close to its caller and extract a helper when it names a real operation or removes meaningful duplication.

## Tokens and conditional content

`ContributionTokenContext.resolve` supplies these tokens:

| Tokens | Meaning |
| --- | --- |
| `targetPath`, `targetDir` | Target path; workspace prefixes resolve without `./` |
| `targetKind`, `targetName`, `packageName` | Kind, chosen name or fallback, and derived package name |
| `projectName` | StackConfig name |
| `runtime`, `packageManager`, `packageManagerSpec` | Runtime and package-manager choices |
| `typescript` | Selected TypeScript major, defaulting to 6 |
| `workspaceDependency` | `*` for npm; `workspace:*` otherwise |
| `lint`, `format`, `test`, `monorepo` | Configured tool or an empty string |
| `runCommand`, `projectRoot` | Runtime-specific script prefix and relative path to the project root |
| `workspaceTargets`, `scaffoldRecipe` | Resolved workspace inventory and initial create command |

Write tokens as `{{targetPath}}`. Use `{{#if lint}}...{{/if}}` for a truthy config field or `{{#if format=biome}}...{{/if}}` for an equality check. Unknown conditional fields evaluate as falsy. Whitespace remains in the rendered result, so check generated JSON for misplaced commas.

Compiler-tool conditionals also include `effectOxlint`, `standaloneOxlint`, `standaloneEffectOxlint`, and `typescript7Diagnostics`. Read ContributionTokenContext for their exact predicates rather than duplicating them in catalog modules.

Continue with [adding a module](add-new-module.md "applies this workflow") or [adding a target](add-new-target.md "applies this workflow").
