import type { ContributionInput } from "@repo/authoring/Define";

// Effect packages release together, so every `effect` and `@effect/*` pin uses this version.
export const EFFECT_VERSION = "4.1.4";

export const EFFECT_RUNTIME_PLATFORM =
  "{{#if runtime=bun}}@effect/platform-bun{{/if}}{{#if runtime=node}}@effect/platform-node{{/if}}{{#if runtime=deno}}@effect/platform-deno{{/if}}";

export const effectDependency = (
  name: string,
  field: "dependencies" | "devDependencies" = "dependencies",
): ContributionInput => ({
  _tag: "pkg-json-entry",
  path: "{{targetPath}}/package.json",
  field,
  name,
  value: EFFECT_VERSION,
});
