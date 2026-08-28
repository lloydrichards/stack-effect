import { describe, expect, it } from "vitest";
import {
  GIT_HOOK_PROVIDER_VALUES,
  getGitHookProvider,
  hasSupportedGitHookTask,
  isGitHookProviderEligible,
} from "./GitHookProviders";

describe("GitHookProviders", () => {
  it("defines the exact finite values, module IDs, and labels", () => {
    expect(GIT_HOOK_PROVIDER_VALUES).toEqual(["none", "lefthook", "husky"]);
    expect(
      GIT_HOOK_PROVIDER_VALUES.map((value) => getGitHookProvider(value)),
    ).toEqual([
      { value: "none", moduleId: undefined, label: "None" },
      {
        value: "lefthook",
        moduleId: "workspace-git-hooks-lefthook",
        label: "Lefthook",
      },
      {
        value: "husky",
        moduleId: "workspace-git-hooks-husky",
        label: "Husky + lint-staged (Node >=24 only)",
      },
    ]);
  });

  it.each([
    [undefined, undefined, false],
    ["biome", undefined, true],
    ["oxfmt", undefined, true],
    [undefined, "biome", true],
    [undefined, "oxlint", true],
    ["biome", "oxlint", true],
    ["dprint", "eslint", false],
  ] as const)(
    "detects supported formatter/linter compositions",
    (format, lint, expected) => {
      expect(
        hasSupportedGitHookTask({
          ...(format === undefined ? {} : { format }),
          ...(lint === undefined ? {} : { lint }),
        }),
      ).toBe(expected);
    },
  );

  it.each([
    ["none", "bun", "bun", false, true],
    ["none", "bun", "bun", true, true],
    ["lefthook", "bun", "bun", true, true],
    ["lefthook", "node", "npm", true, true],
    ["lefthook", "node", "pnpm", true, true],
    ["husky", "bun", "bun", true, false],
    ["husky", "node", "npm", true, true],
    ["husky", "node", "pnpm", true, true],
    ["husky", "node", "bun", true, false],
    ["lefthook", "node", "npm", false, false],
  ] as const)(
    "checks runtime, package manager, Git, and supported-task eligibility",
    (value, runtime, packageManager, git, expected) => {
      expect(
        isGitHookProviderEligible(value, {
          runtime,
          packageManager,
          git,
          format: "biome",
        }),
      ).toBe(expected);
    },
  );
});
