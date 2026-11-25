---
type: Guide
title: Catalog authoring workflow
description: Edit generated files, validate them, and port the concrete diff back to the catalog.
status: stable
sources:
  - id: source-1
    resource: ../../.agents/skills/catalog-workspace/SKILL.md
  - id: source-2
    resource: ../../packages/domain/src/Plan.ts
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
  - id: source-9
    resource: ../../.agents/TASTE.md
  - id: source-10
    resource: ../../catalogs/official/templates/server/src/ServerConfig.ts
  - id: source-11
    resource: ../../catalogs/labs/templates/server-chat-runtime-managed/src/runtime/ChatManagedRuntime.ts
  - id: source-12
    resource: ../../catalogs/official/src/modules/init.ts
  - id: source-13
    resource: ../../packages/scaffold/src/internal/planAssessment.ts
generated: { by: codex, at: "2026-11-22T19:05:07+00:00" }
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

- Use a named `Context.Service` class with a static `.layer`. Declare the caller-facing shape for reusable services. Infer private service shapes where that keeps the code clearer. Qualify new service IDs by owning package, for example `@repo/db/TodoRepository`. Keep existing IDs stable, including the reference's `"TodoRepository"`.
- Resolve reusable service dependencies when constructing its Layer. Supply platform Layers in the app. Use `Layer.provide` for implementation dependencies and `Layer.provideMerge` when downstream consumers also need the dependency. Give standalone Layers PascalCase role names, such as `TodoHandlers` and `TodoRoutes`. Add `Layer` where the role needs clarification.
- Use `Schema.Struct` with a derived type for ordinary records, branded schemas for IDs, and `Schema.Opaque` when the whole record requires a distinct construction boundary. Use tagged errors for expected failures. Translate infrastructure failures in the service and assign HTTP statuses in the HTTP contract.
- Resolve shared services when building handler groups. Resolve request-specific services inside the handler. Keep HttpApi's default HTTP 400 for schema rejection. Use typed validation middleware when clients need a stable error body. For manual decoding in another HTTP adapter, handle validation failure next to the decode.
- Declare feature configuration at module scope and read it when building the feature Layer. Give shared settings one owner. The server entry point and upstream GraphQL route reuse the same port config, while the route owns its optional upstream URL.
- Follow the coding taste guide for inline workflows, schema conversions, and exhaustive matching in generated examples. Managed chat is the example for scoped reservations and background fibers that outlive a request and stop with their owner Layer.

## Test generated code

Keep catalog regression tests in the repository and run them against generated projects. The Vitest workspace module provides configuration and the root runner. A generated package starts without a test script. Add `"test": "vitest run"` when the package has tests, so a registered task fails if it discovers zero tests.

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


## Extend a compiled package export

Use a `pkg-json-entry` contribution for `exports`. When a new package selects Publishable Library, the contribution can use the `module=package-library` condition to write the compiled path. When extending an existing package with the generated Publishable Library build and pack settings, Plan reads `tsconfig.build.json` and uses the generated source inclusion rules to infer compiled exports. With the default `outDir: "dist"`, it maps source exports to `./dist/X.js` for `rootDir: "src"` or `./dist/src/X.js` for `rootDir: "."`. The root export filename can change independently. Plan accepts TypeScript config comments and checks the manifest’s `files` rules against the candidate export paths. It prefers the verified compiled file and keeps explicitly packed source when the compiled candidate cannot be verified or is excluded. Exact file rules take precedence over broad patterns. A literal directory rule includes its descendants. A wildcard that matches only a directory does not establish that a descendant is packed. Plan declines contradictory exact rules and precedence that depends on filesystem casing. The generated build requires an explicit `files` list for this inference. For other compiler input filters, include the source in `files` or add the export manually.
