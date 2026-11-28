---
type: Guide
title: Add a catalog target
description: Register a target kind and validate its generated paths and base contributions.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../catalogs/official/src/targetRegistry.ts
  - id: source-3
    resource: ../../apps/cli/src/authoring.ts
generated: { by: codex, at: "2026-11-21T18:01:47+00:00" }
---

# Add a catalog target

Start with the [catalog authoring workflow](catalog-authoring.md "validates generated output") and prototype the generated files. A target represents an architectural destination, such as a worker application; runtime and tool choices belong in configuration or modules.

## Register the definition

`TargetKind` accepts custom strings, so a new kind does not require adding a schema literal. Add a plain definition to the `defineTargets(import.meta.url, [...])` group in `catalogs/official/src/targetRegistry.ts`, with file bodies in `catalogs/official/templates/<kind>/`.

```typescript
{
  kind: "worker",
  title: "Worker",
  description: "A background worker",
  defaultName: "jobs",
  requiredModules: [],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/src/index.ts",
      contents: template("./worker/src/index.ts"),
    },
  ],
}
```

This illustrates the definition shape. Add the package manifest, scripts, dependencies, and TypeScript configuration needed by the validated prototype. They are tagged contributions, not separate contribution buckets. Use existing target definitions to identify shared modules rather than duplicating their setup.

`requiredModules` lists modules that Blueprint must attach whenever the target is selected. Each module must exist and support the target. `defaultName` supplies a name when a recipe omits it or when a dependency creates an implicit target. See [catalog definitions](../domain/catalog-definitions.md "defines kind and title") for the distinction between `kind` and `title`.

## Respect identity-derived paths

| Identity | Path |
| --- | --- |
| workspace/root | `.` |
| package/domain | `packages/domain` |
| server/api | `apps/server-api` |
| worker/jobs | `apps/worker-jobs` |
| worker with an empty name | `apps/worker` |

Names are trimmed and converted to kebab case. A TargetKey identifies the kind and canonical name. Plan reuses an existing package directory by its manifest name and uses the suggested directory when the package is absent.

## Verify the target

Complete the authoring workflow checks, then exercise the new kind in a temporary repository. Use the repository authoring entrypoint to load unpublished definitions. Point add at the project directory created by init.

```bash
TMP_REPO="$(mktemp -d)"
trap 'rm -rf "$TMP_REPO"' EXIT
bun apps/cli/src/authoring.ts init test-app --yes --root "$TMP_REPO"
bun apps/cli/src/authoring.ts add --yes --root "$TMP_REPO/test-app" --target worker/jobs --dry-run
```

For a missing target, check registration and visibility. For incompatible modules, check their `supportedOn` rules. For a missing required module, check the exact ModuleId and that `moduleRegistry.ts` includes its group.

See [identity contracts](../domain/identity.md "defines path behavior") and [catalog architecture](../architecture/catalog.md "owns target definitions").
