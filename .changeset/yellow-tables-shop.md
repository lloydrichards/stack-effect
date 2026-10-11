---
"stack-effect": minor
"@stack-effect/author": minor
---

Scaffold publishable ESM libraries with compiled JavaScript and TypeScript declarations.

For example, `stack-effect add --target package/sdk:package-library` creates a library under `packages/sdk` with one root export and a build before npm packing. The starter has no child modules.

Catalog authors can use `pkg-json-field` to set publishing fields such as `files`, `peerDependencies`, and conditional `exports`. Differing existing values require an Apply decision.
