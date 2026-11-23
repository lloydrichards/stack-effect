---
type: Guide
title: Add a catalog module
description: Define a module with current tagged dependencies and target-owned contributions.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../catalogs/official/src/modules/domain.ts
  - id: source-3
    resource: ../../catalogs/official/src/moduleRegistry.ts
  - id: source-4
    resource: ../../catalogs/labs/src/receipt-app.ts
generated: { by: claude, at: "2026-11-24T00:00:00+00:00" }
---

# Add a catalog module

Start with the [catalog authoring workflow](catalog-authoring.md "validates generated output"). Choose a [module ID](../architecture/catalog-id-semantics.md "guides naming") that describes the owning layer and capability.

## Choose a display title

Write a short noun phrase that names what the module adds. Lead with the feature or artifact, as in `AI Chat` or `Receipt Workflow Form`. Use the product name on its own when it identifies the choice, as in `Vitest`.

- Let the target heading identify the owner. Use `Cluster Counter Form` on both React Client and Foldkit Client. Keep role words when they describe the contribution, as in `HTTP API Client`, `HTTP API Endpoints`, and `HTTP API Contracts`.
- Add a technology qualifier when it distinguishes choices, as in `Todo Endpoints (HTTP API)`. Lead with technology in familiar names such as `WebSocket Presence`.
- Give equivalent contributions the same title across targets. Check the Recipe Builder module picker and dependency tree, and the CLI picker. Distinguish different contributions that can appear together, such as `Biome Linting` and `Biome Formatting`. If equivalent titles need disambiguation in a mixed view, show the owning target beside the title.
- Use title case and preserve product capitalization. Put prerequisites and implementation details in the description. Keep the module ID stable when editing its display title.

## Define the module

Prototype generated files first. Then add the definition to the relevant `catalogs/official/src/modules/*.ts` group and ensure `moduleRegistry.ts` includes that group. Use an existing sibling definition as the template.

Definitions are plain JSON-shaped data grouped by `defineModules(import.meta.url, [...])` from `@repo/authoring`, which records the source file for build errors. Keep each generated file body in `catalogs/official/templates/<module-id>/<path>` and reference it with `template(...)`; the build embeds its exact bytes. This example shows the required fields for a package-owned module:

```typescript
import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

export const healthModules = defineModules(import.meta.url, [
  {
    id: "domain-health-contracts",
    title: "Health Contracts",
    description: "Shared health check schemas",
    supportedOn: [
      { _tag: "identity", identity: { kind: "package", name: "domain" } },
    ],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/Health.ts",
        contents: template("./domain-health-contracts/src/Health.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "exports",
        name: "./Health",
        value: "./src/Health.ts",
      },
    ],
  },
]);
```

Templates may contain tokens and `{{#if}}` blocks, so they are excluded from type-checking, linting, formatting, and Git line-ending conversion. Git, Oxfmt, and Oxlint read some file names in nested directories, so store `.gitignore`, `.gitattributes`, `.oxfmtrc.json(c)`, `.oxlintrc.json`, and `.editorconfig` templates with the dot replaced by an underscore, such as `_gitignore`, and keep the contribution `path` as `.gitignore`. A test in `catalogs/official` enforces this. Short fragments, such as `ts-call-arg` arguments, stay inline.

Use `{ _tag: "identity", identity: { kind, name } }` when a module belongs only to one identity, such as `package/domain`. Kind support applies to every matching target kind. Visibility defaults to public; internal modules remain available for dependency resolution.

## Declare cross-target requirements

Contributions stay on the owning target. Declare requirements as separate tagged entries:

```typescript
dependencies: [
  { _tag: "required-target", identity: domainTarget },
  {
    _tag: "required-module",
    target: domainTarget,
    moduleId: "domain-api-contracts",
  },
]
```

A `required-module` already implies target existence, so normally omit the redundant `required-target` entry. A `required-capability` contains `target` and `capability`; selection must choose a concrete provider before Blueprint resolution. Providers declare `provides`, and incompatible alternatives may declare `conflictsWith`.

For the browser Receipt Workflow, the API requires a database-owned module that in turn requires `db-sql`. Recipe Builder can then use its database selector for both browser clients. Keep provider-specific file contributions on `package/db` so `module=` conditions can see the selected provider. See source 4.

An implication uses `{ targetKind, moduleId }` in `implies`. It connects selection across target kinds; recipe and CLI handling resolve the concrete target. A child uses `{ moduleId, requirement: "required" | "optional" }` in `children`. Children organize same-target selection and do not replace Blueprint dependencies.

## Choose contribution operations

Use `file` for authoritative content; `pkg-json-entry` for an export, dependency, devDependency, or script; and `ts-call-arg`, `ts-object-field`, or `jsx-slot` for composition into existing code. Give each public module of a package its own `exports` subpath named after the module, and import it through that subpath from other targets. Do not add a root `src/index.ts` of re-exports; see the [contribution contract](../domain/contributions.md "defines package entry points"). A file contribution can set `conflictOnModify` when replacing existing content should require a decision.

A package dependency entry has this shape:

```typescript
{
  _tag: "pkg-json-entry",
  path: "{{targetPath}}/package.json",
  field: "dependencies",
  name: "@repo/domain",
  value: "{{workspaceDependency}}",
}
```

Finish the reset, diff, and validation cycle in the authoring workflow. Check the catalog graph and selection behavior. For a missing module, check that `moduleRegistry.ts` includes its group and that the identifier is spelled correctly; for a missing picker entry, check visibility, supported identity, and parent-child membership.
