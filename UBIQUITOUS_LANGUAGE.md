# Ubiquitous Language

## Core flow

| Term             | Definition                                                                                                 | Aliases to avoid                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Selection**    | The explicit user-authored scaffold request before any dependency expansion.                               | Request, input graph, resolved request   |
| **Blueprint**    | The normalized resolved scaffold graph produced from a **Selection** before any repo-state reconciliation. | Plan input, internal IR, generated graph |
| **Plan**         | The repo-aware virtual filesystem projection compiled from a **Blueprint**.                                | Diff, patch, apply result                |
| **Confirmation** | A read-only review step where a user checks the **Blueprint** before planning.                             | Edit, approval workflow                  |

## Scaffold structure

| Term                 | Definition                                                                                          | Aliases to avoid                    |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Target kind**      | A registered scaffold archetype that defines a minimal skeleton and allowed capabilities.           | Scope, template kind, app type      |
| **Target**           | A named scaffolded monorepo entity selected or resolved from a **Target kind**.                     | Workspace, module, package kind     |
| **Canonical target** | A fixed well-known **Target** identity that dependency expansion may imply deterministically.       | Auto target, generated target       |
| **Repo module**      | A repository-wide scaffold capability applied once at repo scope.                                   | Root target, global target          |
| **Target module**    | A scaffold capability attached to one specific resolved **Target**.                                 | Feature, plugin, mixin              |
| **Capability**       | A reusable behavior that can be selected or implied as a **Repo module** or **Target module**.      | Module type, option                 |
| **Root bootstrap**   | The umbrella **Repo module** that establishes minimal monorepo foundation.                          | Init, root target, repo skeleton    |
| **Base skeleton**    | The minimal scaffold owned by a **Target kind** even when no modules are selected.                  | Default module, starter feature     |
| **Slot override**    | A narrow blueprint-time replacement of an exposed base skeleton slot by a module-owned alternative. | Deletion, patch, arbitrary override |

## Planning and output

| Term                  | Definition                                                                                        | Aliases to avoid                  |
| --------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Intent**            | A structured statement of what should exist without committing to disk writes.                    | File diff, patch, template output |
| **Flat intent set**   | The final conflict-free list of **Intents** emitted by a **Blueprint**.                           | Nested graph, compiler plan       |
| **Repo snapshot**     | The planner's read-only view of the current repository state.                                     | Repo model, live repo             |
| **Planned entry**     | A classified path-level item in the public **Plan** output.                                       | Change record, file diff          |
| **Virtual tree**      | The nested projection of the full planned repo shape.                                             | Filesystem diff tree, patch tree  |
| **Merge requirement** | A path-level report that planning cannot complete safely without a later merge strategy decision. | Conflict, failure                 |
| **Cause**             | Typed provenance explaining why a resolved node or planned path exists.                           | Reason string, source module      |

## Status and dependency language

| Term                     | Definition                                                                                         | Aliases to avoid                   |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Selected**             | Present because the user asked for it explicitly.                                                  | Manual, direct only                |
| **Implied**              | Present because resolution added it to satisfy a dependency or base requirement.                   | Auto-created, inferred only        |
| **Dependency expansion** | The process of adding required resolved modules or targets to make a **Selection** coherent.       | Planning, compilation              |
| **Normalization**        | The process of deduplicating and stabilizing resolved output without changing its meaning.         | Rewrite, mutation                  |
| **Collision**            | A conceptual identity clash where two requested targets claim the same resolved monorepo location. | Merge conflict, duplicate name     |
| **Ambiguity**            | A repo-state condition where planning cannot safely choose one merge result for a path.            | Blueprint error, invalid selection |

## First-slice terms

| Term                | Definition                                                                                          | Aliases to avoid                       |
| ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Package domain**  | The canonical shared package target that hosts common domain contracts for the first slice.         | Contracts package, shared package      |
| **Domain API**      | The target module attached to **Package domain** that owns the `@repo/domain/Api` contract surface. | API package, endpoint module           |
| **HTTP API server** | The server-side target module that wires a server target to the shared domain API contract.         | Server base, transport-agnostic server |

## Relationships

- A **Selection** produces exactly one **Blueprint** when resolution succeeds.
- A **Blueprint** produces exactly one **Plan** for a given repo state.
- A **Target kind** owns one **Base skeleton**.
- A **Target** is an instance of exactly one **Target kind**.
- A **Target** may have zero or more **Target modules**.
- A **Repo module** belongs to repo scope and never belongs to a **Target**.
- A **Canonical target** is a special **Target** with a fixed identity known by the registry.
- **Dependency expansion** may add **Implied** repo modules, canonical targets, and target modules.
- **Root bootstrap** is a **Repo module** required by every target kind in v1.
- A **Plan** is built from a confirmed **Blueprint** plus a **Repo snapshot**.
- A **Planned entry** may have one or more **Causes**.
- A **Merge requirement** applies to exactly one planned path.
- **Package domain** is a canonical target in the first slice.
- **Domain API** belongs to **Package domain**.
- **HTTP API server** depends on **Package domain** and **Domain API**.

## Example dialogue

> **Dev:** "If the user selects a **server** target with the **HTTP API server** capability, does the **Selection** include `package/domain` too?"
>
> **Domain expert:** "No. The **Selection** stays explicit. `package/domain` first appears in the **Blueprint** as an **Implied** **Canonical target**."
>
> **Dev:** "And the shared contract itself is modeled as the **Domain API**, not as part of the server base skeleton?"
>
> **Domain expert:** "Correct. The **HTTP API server** depends on the **Domain API** attached to **Package domain**."
>
> **Dev:** "So by the time we build the **Plan**, the **Flat intent set** is already normalized and we only reconcile it against the **Repo snapshot**?"
>
> **Domain expert:** "Exactly. Planning handles classification and **Merge requirements**, not dependency expansion."

## Flagged ambiguities

- "module" was used for both repo-scoped and target-scoped capabilities. Use **Repo module** and **Target module** when scope matters; reserve **Capability** for the shared idea.
- "target" and "workspace" can sound interchangeable. Prefer **Target** for the scaffold-domain concept and use workspace terms only when discussing concrete package manager behavior.
- "request" and "selection" were both used for the user-authored input. Prefer **Selection** as the canonical term.
- "reason", "source module", and "provenance" were all used for attribution. Prefer **Cause** for typed domain data and use provenance only as explanatory prose.
- "conflict" and "ambiguity" can be conflated. Prefer **Ambiguity** for planning-time unresolved merge situations and reserve error language for invalid **Selection** or incoherent **Blueprint** composition.
- "domain" can mean the repo's business domain or the canonical shared package target. Prefer **scaffold domain** for the overall problem space and **Package domain** for the first-slice canonical target.
