---
type: Guide
title: Add a catalog target
description: Register a target kind and validate its generated paths and base contributions.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/catalog/src/registry/targetRegistry.ts
  - id: source-3
    resource: ../../apps/cli/src/commands/init.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Add a catalog target

Start with the [catalog authoring workflow](catalog-authoring.md "validates generated output") and prototype the generated files. A target represents an architectural destination, such as a worker application; runtime and tool choices belong in configuration or modules.

## Register the definition

`TargetKind` accepts custom branded strings, so a new kind does not require adding a schema literal. Add a definition to `packages/catalog/src/registry/targetRegistry.ts`.

```typescript
import { type TargetDefinition, TargetKind } from "@repo/domain/Catalog";
import { workerContents } from "./content/worker";

export const workerTarget: typeof TargetDefinition.Type = {
  kind: TargetKind.make("worker"),
  title: "Worker application",
  description: "A background worker",
  defaultName: "jobs",
  requiredModules: [],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/src/index.ts",
      contents: workerContents,
    },
  ],
};
```

This illustrates the definition shape. Add the package manifest, scripts, dependencies, and TypeScript configuration needed by the validated prototype. They are tagged contributions, not separate contribution buckets. Use existing target definitions to identify shared modules rather than duplicating their setup.

`requiredModules` lists modules that Blueprint must attach whenever the target is selected. Each module must exist and support the target. `defaultName` supplies a name where recipe creation needs a missing target; interactive visibility is a separate setting.

## Respect identity-derived paths

| Identity | Path |
| --- | --- |
| workspace/root | `.` |
| package/domain | `packages/domain` |
| server/api | `apps/server-api` |
| worker/jobs | `apps/worker-jobs` |
| worker with an empty name | `apps/worker` |

Names are trimmed and converted to kebab case for paths. TargetKey and TargetPath currently derive from the same path function but have different domain roles. A new path convention is a shared identity-contract change, not a local template workaround.

## Verify the target

Complete the authoring workflow checks, then exercise the new kind in a temporary repository. The add command must point at the project directory created by init:

```bash
TMP_REPO="$(mktemp -d)"
trap 'rm -rf "$TMP_REPO"' EXIT
bun run start -- init test-app --yes --root "$TMP_REPO"
bun run start -- add --yes --root "$TMP_REPO/test-app" --target worker/jobs --dry-run
```

For a missing target, check registration and visibility. For incompatible modules, check their `supportedOn` rules. For a missing required module, check the exact ModuleId and registry inclusion.

See [identity contracts](../domain/identity.md "defines path behavior") and [catalog architecture](../architecture/catalog.md "owns target definitions").
