---
"stack-effect": minor
"@stack-effect/author": minor
---

Generated projects now use Effect 4.1.4, Vitest 5, and updated application and build tooling, with migrated crypto, MCP, Foldkit, and Alchemy code.

TypeScript 7 projects with Oxlint now enable the strict Effect preset. Expected platform APIs use explicit allowlists; style suggestions stay visible as warnings. Bun projects use the hoisted linker for TypeScript declaration compatibility.

`@stack-effect/author` now requires Effect 4.1.4. Update the Effect runtime packages together when upgrading an existing author project.
