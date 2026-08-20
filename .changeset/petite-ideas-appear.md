---
"stack-effect": minor
"@stack-effect/docs": minor
---

New projects now default to Bun, TypeScript 7, Vite+, Oxlint, Oxfmt, and Vitest.

Generated commands omit these choices when they match the defaults. To keep the previous TypeScript 6, Turbo, and Biome stack, pass the corresponding `create` or `init` options explicitly.

The Recipe Builder uses the same defaults and keeps existing Nx shared links compatible by selecting TypeScript 6, which Nx currently requires.
