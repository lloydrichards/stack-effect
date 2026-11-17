---
"stack-effect": minor
"@stack-effect/author": minor
---

Generated projects now include root and workspace READMEs with local commands, an initial scaffold recipe, and a link to the Stack Effect documentation. `stack-effect add --yes` preserves user-edited READMEs.

Catalog authors can use the `scaffoldRecipe`, `workspaceTargets`, `projectRoot`, and `runCommand` template tokens and the `hasApps` condition. Catalogs declare these capabilities only when their templates use them.
