# Domain Package AGENTS.md

> See root `/AGENTS.md` for monorepo conventions.

## Purpose

Shared schemas, types, and RPC definitions used by both client and server.

## Domain Terminology References

Use canonical domain language from:

- `.docs/ubiquitous-language.md` for conversation-ready phrasing
- `.docs/domain-lexicon.md` for precise definitions and invariants
- `CONTEXT.md` for current domain decisions and constraints

## Import Pattern

```typescript
// From other workspaces, import with subpath
import { Api, type ApiResponse } from "@repo/domain/Api";
import { EventRpc, type TickEvent } from "@repo/domain/Rpc";
import { WebSocketRpc, type ClientInfo } from "@repo/domain/WebSocket";

// Use 'type' keyword for type-only imports
import type { ClientStatus } from "@repo/domain/WebSocket";
```

## Naming Conventions

| Element       | Convention                | Example           |
| ------------- | ------------------------- | ----------------- |
| Schemas       | PascalCase                | `ClientInfo`      |
| Types         | Same as schema            | `type ClientInfo` |
| Branded types | PascalCase noun           | `ClientId`        |
| Events        | PascalCase + Event suffix | `WebSocketEvent`  |
| RPC groups    | PascalCase + Rpc suffix   | `EventRpc`        |
| API groups    | PascalCase + Group suffix | `HelloGroup`      |

---

_This document is a living guide. Update it as the project evolves and new
patterns emerge._
