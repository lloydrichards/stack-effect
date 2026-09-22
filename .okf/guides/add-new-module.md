---
type: Guide
title: Add a catalog module
description: Define a module with current tagged dependencies and target-owned contributions.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/catalog/src/registry/modules/domain.ts
  - id: source-3
    resource: ../../packages/catalog/src/registry/moduleRegistry.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Add a catalog module

Start with the [catalog authoring workflow](catalog-authoring.md "validates generated output"). Choose a [catalog ID](../architecture/catalog-id-semantics.md "guides naming") that describes the owning layer and capability.

## Define the module

Prototype generated files first. Then add the definition to the relevant `packages/catalog/src/registry/modules/*.ts` group and ensure `moduleRegistry.ts` includes that group. Use an existing sibling definition as the template.

This example shows the required fields for a server-owned module. The content symbol represents the validated generated file.

```typescript
import { type ModuleDefinition, ModuleId, TargetKind } from "@repo/domain/Catalog";
import { healthContents } from "../content/health";

export const healthModule: typeof ModuleDefinition.Type = {
  id: ModuleId.make("server-health"),
  title: "Health endpoint",
  description: "HTTP health endpoint for the server",
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
  dependencies: [],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/src/Health.ts",
      contents: healthContents,
    },
    {
      _tag: "barrel-export",
      barrelPath: "{{targetPath}}/src/index.ts",
      exportPath: "./Health",
    },
  ],
};
```

Use `{ _tag: "identity", identity: new TargetIdentity({ kind, name }) }` when a module belongs only to one identity, such as `package/domain`. Kind support applies to every matching target kind. Visibility defaults to public; internal modules remain available for dependency resolution.

## Declare cross-target requirements

Contributions stay on the owning target. Declare requirements as separate tagged entries:

```typescript
dependencies: [
  { _tag: "required-target", identity: domainTarget },
  {
    _tag: "required-module",
    target: domainTarget,
    moduleId: ModuleId.make("domain-api-contracts"),
  },
]
```

A `required-module` already implies target existence, so normally omit the redundant `required-target` entry. A `required-capability` contains `target` and `capability`; selection must choose a concrete provider before Blueprint resolution. Providers declare `provides`, and incompatible alternatives may declare `conflictsWith`.

An implication uses `{ targetKind, moduleId }` in `implies`. It connects selection across target kinds; recipe and CLI handling resolve the concrete target. A child uses `{ moduleId, requirement: "required" | "optional" }` in `children`. Children organize same-target selection and do not replace Blueprint dependencies.

## Choose contribution operations

Use `file` for authoritative content; `pkg-json-entry` for an export, dependency, devDependency, or script; `barrel-export` for a re-export; and `ts-call-arg`, `ts-object-field`, or `jsx-slot` for composition into existing code. A file contribution can set `conflictOnModify` when replacing existing content should require a decision.

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

Finish the reset, diff, and validation cycle in the authoring workflow. Check the catalog graph and selection behavior. For a missing module, check registry inclusion and identifier spelling; for a missing picker entry, check visibility, supported identity, and parent-child membership.
