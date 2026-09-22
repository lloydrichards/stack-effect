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
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Catalog authoring workflow

Catalog content strings do not give the editor a real TypeScript or JSON file to check. Follow the repository's catalog workspace skill at `.agents/skills/catalog-workspace/SKILL.md` before changing generated content.

1. Run `bun run catalog:reset-workspace`. This replaces the disposable `workspace/catalog-built` directory, runs Finalize, and creates its internal baseline. Save any experiments you need before resetting.
2. Locate the generated file through source annotations or `.catalog-build-manifest.json`. Edit and check that real file first. For a new module or target, prototype its files in the generated workspace before adding the catalog definition.
3. Run `bun run catalog:validate-workspace` and inspect `bun run catalog:diff-workspace`.
4. Port the smallest validated change to its owning contribution or content string. A composed file may belong to several contributors; do not copy the entire result into one base template.
5. Reset again and confirm the catalog reproduces the intended output. Run validation on that freshly generated result.
6. Run `bun format`, `bun lint`, and `bun run type-check`. For catalog behavior changes, also run `bun run test --filter=@repo/catalog` and `bun run test --filter=stack-effect`, plus the relevant generated-project checks.

Reset can fail during dependency installation or a module finalizer. Resolve that failure before treating the workspace as a validated baseline. Do not commit `workspace/catalog-built` to the parent repository.

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

Write tokens as `{{targetPath}}`. Use `{{#if lint}}...{{/if}}` for a truthy config field or `{{#if format=biome}}...{{/if}}` for an equality check. Unknown conditional fields evaluate as falsy. Whitespace remains in the rendered result, so check generated JSON for misplaced commas.

Compiler-tool conditionals also include `effectOxlint`, `standaloneOxlint`, `standaloneEffectOxlint`, and `typescript7Diagnostics`. Read ContributionTokenContext for their exact predicates rather than duplicating them in catalog modules.

Continue with [adding a module](add-new-module.md "applies this workflow") or [adding a target](add-new-target.md "applies this workflow").
