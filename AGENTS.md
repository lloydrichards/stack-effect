# AGENTS.md

> Note: This file is the authoritative source for coding agent instructions. If
> in doubt, prefer AGENTS.md over README.md. See nested AGENTS.md files in each
> workspace for app-specific patterns.

## Commands

| Command                                        | Purpose                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `bun install`                                  | Install dependencies                      |
| `bun dev`                                      | Start all apps (client:3000, server:9000) |
| `bun dev --filter=client`                      | Start client only                         |
| `bun dev --filter=server`                      | Start server only                         |
| `bun run build`                                | Build all apps                            |
| `bun lint`                                     | Lint with Biome                           |
| `bun format`                                   | Format with Biome                         |
| `bun test`                                     | Run all tests (Vitest)                    |
| `bun test --filter=server -- src/file.test.ts` | Run single test file                      |

## Tech Stack

Bun 1.2+, TypeScript 5.9, Effect 4-beta, Vitest 4, Biome 2.4

## Code Style

- **Formatting**: Spaces (not tabs), double quotes for strings
- **Imports**: Use `@repo/domain` for shared types; Biome auto-organizes imports
- **Types**: Effect Schema for validation; `typeof Schema.Type` for inline
  types, `Schema.Schema.Type<typeof T>` for exports
- **Naming**: camelCase variables/functions, PascalCase types/classes/React
  components
- **Effect patterns**: `Effect.gen` + `yield*` for all Effect operations; Layer
  composition for DI
- **Error handling**: Use Effect error channel; avoid try/catch
- **Type safety**: Never use `as unknown as` casts; if a type cannot be expressed safely, fix the model or use framework-provided typed test stubs/helpers

## Effect Essentials

```typescript
// Always use yield* to unwrap Effect values
Effect.gen(function* () {
  const service = yield* MyService; // Access service from Context
  const result = yield* service.method(); // Unwrap Effect result
  yield* Effect.log("done"); // Side effects
  return result;
});
```

## Structure

| Workspace         | Stack              | AGENTS.md                   |
| ----------------- | ------------------ | --------------------------- |
| `apps/cli`        | Effect Cli         | `apps/cli/AGENTS.md`        |
| `packages/domain` | Effect Schema, RPC | `packages/domain/AGENTS.md` |

## Local Source References

## Complexity Analysis

Use the complexity report to identify refactoring targets before making changes.
The `--json` flag emits structured output suitable for direct consumption.

```bash

# For dead
bunx fallow -f json
bunx fallow dead-code -f json
bunx fallow fix --dry-run -f json

# For complexity
bunx fallow health -f json

# For specific directories
bunx fallow -f json -r apps/cli
```

The JSON schema:

```typescript
{
  threshold: number;
  totalFunctions: number;
  levelCounts: {
    low: number;
    normal: number;
    high: number;
    extreme: number;
  }
  functions: Array<{
    file: string; // relative path from repo root
    name: string; // function signature (truncated to 80 chars)
    line: number;
    complexity: number;
    level: "low" | "normal" | "high" | "extreme";
    reasons: Array<{
      // only present for high/extreme
      description: string;
      complexity: number;
      line: number;
      col: number;
      text: string;
    }> | null;
  }>;
}
```

**Workflow**: run the scoped JSON command first, parse `functions` sorted
descending by `complexity`, then use `reasons` on high/extreme entries to
understand exactly which branches or expressions are driving the score before
deciding how to refactor.

## Local Source References

When answering questions about Effect, search these
cloned source repos first. When updating dependencies, pull the latest
commits in these repos to ensure the LLM references current code:

- `.reference/effect/`
- `.reference/t3-stack/`
- `.reference/better-t-stack/`
- `.reference/shadcn/`
- `.reference/effect-boxes/`

If any of the folders are missing (they are git ignored), clone them into
`reference/`:

- `https://github.com/Effect-TS/effect-smol.git` -> `.reference/effect/`
- `https://github.com/t3-oss/create-t3-app.git` -> `.reference/t3-stack/`
- `https://github.com/AmanVarshney01/create-better-t-stack.git` -> `.reference/better-t-stack/`
- `https://github.com/shadcn-ui/ui.git` -> `.reference/shadcn/`
- `https://github.com/lloydrichards/proj_effect-boxes.git` -> `.reference/effect-boxes/`

---

_This document is a living guide. Update it as the project evolves and new
patterns emerge._
