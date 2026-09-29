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

Open the repo in VS Code or any editor that supports [Dev Containers](https://containers.dev/). The container includes bun, node, Oxlint, Oxfmt, and Playwright. Dependencies install automatically on creation.

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
| `bun lint`                        | Lint with Oxlint                        |
| `bun format`                      | Format with Oxfmt                       |
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
| `packages/config-typescript` | Shared TypeScript configuration                              |

## Common Contributions

### Adding a Module to the Catalog

Modules are features that get scaffolded into a target (e.g., `http-api-client` adds an API client to a client app). To add one:

1. **Templates** — put each generated file body in `catalogs/official/templates/<module-id>/<path>` (store names that Git, Oxfmt, or Oxlint read, such as `.gitignore`, as `_gitignore`)
2. **Module definition** — add a plain definition to the `defineModules(import.meta.url, [...])` group in the appropriate file under `catalogs/official/src/modules/` (organized by target kind: `client.ts`, `server.ts`, `domain.ts`, `packages.ts`), referencing templates with `template("./<module-id>/<path>")`
3. **Registry** — if you created a new module file, add its group to `catalogs/official/src/moduleRegistry.ts`

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

## Releasing

Releases use [changesets](https://github.com/changesets/changesets). Add a changeset with `bunx changeset`. When changesets are pending on `main`, the Release workflow opens a "chore: version packages" PR. Merging that PR publishes the bumped packages to npm.

Changes that affect the published registry assets (`/registry/v1/*.json` and `/schemas/v1/*`) also follow the deployment and qualification checklist in [apps/docs/REGISTRY-DEPLOYMENT.md](./apps/docs/REGISTRY-DEPLOYMENT.md): run `check:registry` against a public preview and production, then prove the create path with a newly installed CLI.

The workflow has no npm token. npm authenticates it through [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). Each package's `repository` field must name this repository and its `directory`.

### Publish a new package for the first time

npm can configure a trusted publisher only for a package that already exists. So a new public package, such as `@stack-effect/author`, needs one manual publish:

1. Create the npm scope's organization, if it does not exist yet.
2. Check out the merged `main`, then build and verify the package:

   ```bash
   bun install
   bun run build --filter=@stack-effect/author
   bun run --cwd packages/author verify:package
   ```

3. Publish the current `0.0.0` version as a bootstrap release:

   ```bash
   npm login
   cd packages/author && npm publish --access public
   ```

4. Configure the trusted publisher. Your npm account must have two-factor authentication enabled; the command asks for it:

   ```bash
   npm trust github @stack-effect/author --file publish.yml --repo lloydrichards/stack-effect --allow-publish
   ```

   `--allow-publish` is required: new publishers allow only `npm stage publish` by default, and Changesets publishes directly. Leave the environment unset. Check the result with `npm trust list @stack-effect/author`.
5. Optional: under **Publishing access**, require two-factor authentication and disallow tokens.
6. Merge the version packages PR. CI publishes the first real version with provenance. For `@stack-effect/author`, CI then installs the published version in a clean project.

## References

- [AGENTS.md](./AGENTS.md) — code style, domain rules, Effect patterns
- [.okf/domain/ubiquitous-language.md](./.okf/domain/ubiquitous-language.md) — canonical domain terminology
- [.okf/domain/index.md](./.okf/domain/index.md) — precise definitions and invariants
