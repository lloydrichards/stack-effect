# @repo/domain

Shared Effect Schema contracts and domain vocabulary for the stack-effect scaffolding pipeline.

## Role

Defines the canonical types that flow through the CLI's core pipeline: Catalog, Selection, Blueprint, Plan, Apply, and Finalize. All other packages depend on these schemas as the boundary contract.

## Structure

```
src/
├── Catalog.ts       # Target and module definition schemas
├── Selection.ts     # User intent (chosen targets + modules)
├── Blueprint.ts     # Resolved dependency closure
├── Plan.ts          # Repo-aware file operations
├── Apply.ts         # Execution intent with conflict decisions
├── Finalize.ts      # Post-apply command results
╰── StackConfig.ts   # Project configuration schema
```

## Usage

```typescript
import { Selection } from "@repo/domain/Selection";
import { Blueprint } from "@repo/domain/Blueprint";
import type { PlanEntry } from "@repo/domain/Plan";
```
