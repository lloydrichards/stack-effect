# Contributing to stack-effect

Thanks for your interest in contributing to stack-effect.

## Development Setup

### Nix + direnv (recommended)

If you have [Nix](https://nixos.org/) and [direnv](https://direnv.net/) installed, the dev environment activates automatically:

```bash
git clone <repo-url>
cd stack-effect
direnv allow
bun install
```

The flake provides bun, node, and corepack.

### Devcontainer

Open the repo in VS Code or any editor that supports [Dev Containers](https://containers.dev/). The container includes bun, node, biome, and playwright. Dependencies install automatically on creation.

### Manual

Install [Bun](https://bun.sh/) 1.2+ and run:

```bash
bun install
```

## Running the Project

| Command                           | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `bun dev`                         | Run all workspaces in watch mode        |
| `bun dev --filter=stack-effect`   | Run the CLI in watch mode               |
| `bun run build`                   | Build all workspaces                    |
| `bun run test`                    | Run all tests (Turbo + Vitest)          |
| `bun run test --filter=<package>` | Run tests for a specific workspace      |
| `bun lint`                        | Lint with Biome                         |
| `bun format`                      | Format with Biome                       |
| `bun run type-check`              | TypeScript checks across all workspaces |

All of `bun format`, `bun lint`, and `bun run type-check` must pass before submitting a PR.

## Architecture Overview

The CLI orchestrates a pipeline that turns user choices into a scaffolded project:

```
Selection ──> Blueprint ──> Plan ──> Apply ──> ApplyResult
                                                    │
                                               FinalizeReport
```

Each phase is a distinct domain concept with its own schema and service.

### Package Roles

| Package                      | Role                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| `apps/cli`                   | CLI commands, prompts, and pipeline orchestration            |
| `packages/domain`            | Effect Schema contracts for every pipeline phase             |
| `packages/catalog`           | Read-only target and module definitions                      |
| `packages/scaffold`          | Blueprint resolution, planning, apply, and finalize services |
| `packages/observability`     | Shared OpenTelemetry layer                                   |
| `packages/config-typescript` | Shared TypeScript configuration                              |

## Common Contributions

### Adding a Module to the Catalog

Modules are features that get scaffolded into a target (e.g., `http-api-client` adds an API client to a client app). To add one:

1. **Content templates** — create file content as exported string constants in `packages/catalog/src/registry/content/`
2. **Module definition** — add a `ModuleDefinition` entry in the appropriate file under `packages/catalog/src/registry/modules/` (organized by target kind: `client.ts`, `server.ts`, `domain.ts`, `packages.ts`)
3. **Registry** — if you created a new module file, import and spread it into `packages/catalog/src/registry/moduleRegistry.ts`

Each module definition specifies:

- `id`, `title`, `description`
- `supportedOn` — which target kinds can use this module
- `dependencies` — other modules that must be present
- `implies` — modules auto-added to other targets when this one is selected
- `contributions` — files and package.json entries this module produces

Contribution types: `file`, `pkg-json-entry`, `barrel-export`, `ts-call-arg`. Follow existing modules as reference.

```bash
bun run test --filter=@repo/catalog
bun run type-check
```

### Adding a CLI Command

Commands use `Command.make()` from `effect/unstable/cli`:

1. Create the command in `apps/cli/src/commands/<name>.ts`
2. Register it in `apps/cli/src/index.ts` via `Command.withSubcommands()`
3. Add UI components in `apps/cli/src/components/` if needed

Commands access scaffold services (`BlueprintService`, `PlanService`, etc.) through Effect's context. See existing commands for the pattern.

```bash
bun run test --filter=stack-effect
bun run type-check
```

### Fixing Bugs in Scaffold Logic

Services in `packages/scaffold/src/service/` are organized by pipeline phase:

| Directory    | Phase                                                  |
| ------------ | ------------------------------------------------------ |
| `blueprint/` | Resolving selections into dependency-closed blueprints |
| `plan/`      | Building repo-aware file operations from blueprints    |
| `apply/`     | Executing file writes with conflict handling           |
| `finalize/`  | Running post-apply scripts                             |

Tests are co-located (e.g., `BlueprintService.test.ts` next to `BlueprintService.ts`) and use `@effect/vitest`:

```typescript
import { describe, layer } from "@effect/vitest";

describe("MyService", () => {
  layer(MyService.layer)("method", (it) => {
    it.effect("should do something", () =>
      Effect.gen(function* () {
        const service = yield* MyService;
        // assertions
      }),
    );
  });
});
```

```bash
bun run test --filter=@repo/scaffold
bun run type-check
```

## References

- [AGENTS.md](./AGENTS.md) — code style, domain rules, Effect patterns
- [.docs/ubiquitous-language.md](./.docs/ubiquitous-language.md) — canonical domain terminology
- [.docs/domain-lexicon.md](./.docs/domain-lexicon.md) — precise definitions and invariants
