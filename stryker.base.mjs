// Shared Stryker options for workspaces that test with Vitest.
// Each workspace keeps a `stryker.config.mjs` that spreads this and names
// the production files it owns, so mutants never land in another package.

export const base = {
  testRunner: "vitest",
  // Bun's isolated install hides sibling `@stryker-mutator/*` packages from
  // core's plugin discovery, so load the runner by its resolved path.
  plugins: [import.meta.resolve("@stryker-mutator/vitest-runner")],
  // Stryker's TypeScript checker needs the TS JS API, which TypeScript 7 drops.
  // Mutants that do not compile surface as runtime errors instead.
  checkers: [],
  // Stryker rewrites relative tsconfig paths with the same missing API. Workspace
  // tsconfigs extend through `@repo/config-typescript`, so nothing needs rewriting;
  // a path that never exists skips the preprocessor.
  tsconfigFile: ".stryker-no-tsconfig.json",
  // Vitest strips types without checking them, so `// @ts-nocheck` headers buy
  // nothing. They would also change template fixture bytes that golden tests
  // compare verbatim.
  disableTypeChecks: false,
  // Credit every failing test, not just the first, so reports show tests that
  // never fail and tests with no unique kills. Also avoids the Vitest 5 bail
  // race that reports false survivors (stryker-js#6335).
  disableBail: true,
  timeoutMS: 10000,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
  // Clean runs avoid stale coverage and test attribution. Opt in for a local comparison.
  incremental: false,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  thresholds: { high: 80, low: 60, break: null },
  ignoreStatic: true,
};
