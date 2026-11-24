---
"@stack-effect/author": minor
---

Import each authoring concept from its own subpath: `@stack-effect/author/Define`, `/Template`, `/Build`, and `/Official`. The root entry still re-exports everything, so existing imports keep working and no migration is needed.

```ts
import { defineModules } from "@stack-effect/author/Define";
import { templates } from "@stack-effect/author/Template";
import { buildCatalog } from "@stack-effect/author/Build";
import { loadOfficialCatalog } from "@stack-effect/author/Official";
```
