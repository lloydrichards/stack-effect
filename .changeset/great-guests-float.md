---
"stack-effect": patch
---

Refactor recipe target handling so `--target` works consistently across `create`, `add`, and catalog workspace commands.

This also removes older command surface that was replaced by the unified recipe flow, including `stack-effect create --from ...` and the file-input `stack-effect plan -f ...` usage. Use explicit `--target <targetKind>/<targetName>:<moduleId>[,...]` inputs for non-interactive scaffolding and pipe structured plan input through stdin for `stack-effect plan`.
