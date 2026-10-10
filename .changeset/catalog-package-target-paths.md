---
"stack-effect": minor
"@stack-effect/author": minor
---

Target names now support nested directories while keeping npm package names flat.

For example, `package/sdk/client` creates `packages/sdk/client` with the name `@repo/sdk-client`, and `server/sdk/api` creates `apps/sdk/server-api` with the name `server-sdk-api`. Additions use the same target name to find the existing package. Conflicting package names and overlapping package roots are rejected before files are written.
