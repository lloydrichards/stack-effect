---
"stack-effect": minor
"@stack-effect/author": minor
---

Catalog module and capability dependencies can use `target: "self"` for the requesting target. An explicit identity always selects the named target, even when it has the same kind as the requester.

Migrate custom catalog dependencies that relied on same-kind rebinding to `target: "self"`. Update the CLI before using the new v1 catalog. Consumers of `stack-effect schema` should read the new `target` field in place of `targetKind` and `targetName`.
