import { stripVTControlCharacters } from "node:util";
import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";
import { CLI } from "./harness";

const target = "package/domain:domain-api-contracts";

const runPreview = (
  cli: typeof CLI.Service,
  name: string,
  ...args: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    yield* cli.run(
      "create",
      name,
      "--target",
      target,
      "--yes",
      "--dry-run",
      "--show-files",
      "--root",
      cli.workdir,
      ...args,
    );
    yield* cli.expectExitCode(0);
    return stripVTControlCharacters(cli.lastResult().stdout);
  });

const compact = (value: string) => value.replace(/\s+/g, " ");

const expectContains = (output: string, ...values: ReadonlyArray<string>) =>
  values.forEach((value) => assert.include(compact(output), compact(value)));

const expectExcludes = (output: string, ...values: ReadonlyArray<string>) =>
  values.forEach((value) => assert.notInclude(compact(output), compact(value)));

interface QualityCase {
  readonly label: string;
  readonly args: ReadonlyArray<string>;
  readonly format?: string;
  readonly lint?: string;
}

const qualityCases: ReadonlyArray<QualityCase> = [
  {
    label: "Biome formatter only",
    args: ["--format", "biome", "--lint", "none"],
    format: "biome format --write",
  },
  {
    label: "Oxfmt formatter only",
    args: ["--format", "oxfmt", "--lint", "none"],
    format: "oxfmt",
  },
  {
    label: "Biome linter only",
    args: ["--format", "dprint", "--lint", "biome"],
    lint: "biome lint --write",
  },
  {
    label: "Oxlint linter only",
    args: ["--format", "dprint", "--lint", "oxlint"],
    lint: "oxlint --fix",
  },
  {
    label: "Biome combined",
    args: ["--format", "biome", "--lint", "biome"],
    format: "biome format --write",
    lint: "biome lint --write",
  },
  {
    label: "Oxc combined",
    args: ["--format", "oxfmt", "--lint", "oxlint"],
    format: "oxfmt",
    lint: "oxlint --fix",
  },
];

const providerCases = [
  { provider: "lefthook", runtime: "bun", packageManager: "bun" },
  { provider: "lefthook", runtime: "node", packageManager: "npm" },
  { provider: "lefthook", runtime: "node", packageManager: "pnpm" },
  { provider: "husky", runtime: "node", packageManager: "npm" },
  { provider: "husky", runtime: "node", packageManager: "pnpm" },
] as const;

describe("generated Git-hook contracts", () => {
  layer(CLI.layer)("CLI previews", (it) => {
    it.effect("preserves omitted and explicit-none default parity", () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const omitted = yield* runPreview(cli, "default-parity");
        const explicit = yield* runPreview(
          cli,
          "default-parity",
          "--git-hooks",
          "none",
        );

        assert.strictEqual(omitted, explicit);
        expectContains(omitted, "--git-hooks none");
        expectExcludes(
          omitted,
          "lefthook.yml",
          "lint-staged.config.mjs",
          ".husky/pre-commit",
          "lefthook:install",
          "husky:install",
        );
      }).pipe(Effect.provide(CLI.layer)),
    );

    for (const [providerIndex, entry] of providerCases.entries()) {
      for (const [qualityIndex, quality] of qualityCases.entries()) {
        it.effect(
          `${entry.provider} ${entry.runtime}/${entry.packageManager} ${quality.label}`,
          () =>
            Effect.gen(function* () {
              const cli = yield* CLI;
              const output = yield* runPreview(
                cli,
                `hooks-${providerIndex}-${qualityIndex}`,
                "--git-hooks",
                entry.provider,
                "--runtime",
                entry.runtime,
                "--package-manager",
                entry.packageManager,
                ...quality.args,
              );

              expectContains(
                output,
                `--git-hooks ${entry.provider}`,
                `\"git-hooks:${quality.format ? "format" : "lint"}\"`,
                quality.format ?? quality.lint ?? "missing quality command",
              );

              if (entry.provider === "lefthook") {
                expectContains(
                  output,
                  "lefthook.yml",
                  '\"lefthook\": \"2.1.10\"',
                  "stage_fixed: true",
                  `${entry.packageManager} run lefthook:install`,
                );
                entry.packageManager === "pnpm"
                  ? expectContains(output, "lefthook: true")
                  : expectExcludes(output, "lefthook: true");
                expectExcludes(
                  output,
                  "lint-staged.config.mjs",
                  "husky:install",
                );
              } else {
                expectContains(
                  output,
                  ".husky/pre-commit",
                  "lint-staged.config.mjs",
                  '\"husky\": \"9.1.7\"',
                  '\"lint-staged\": \"17.4.1\"',
                  `${entry.packageManager} run lint-staged`,
                  `${entry.packageManager} run husky:install`,
                );
                expectExcludes(output, "lefthook.yml", "stage_fixed: true");
              }

              quality.format
                ? expectContains(output, '"git-hooks:format"')
                : expectExcludes(output, '"git-hooks:format"');
              quality.lint
                ? expectContains(output, '"git-hooks:lint"')
                : expectExcludes(output, '"git-hooks:lint"');

              if (quality.format && quality.lint) {
                assert.isBelow(
                  output.indexOf(
                    `${entry.packageManager} run git-hooks:format --`,
                  ),
                  output.indexOf(
                    `${entry.packageManager} run git-hooks:lint --`,
                  ),
                );
              }
            }).pipe(Effect.provide(CLI.layer)),
          { timeout: 30_000 },
        );
      }
    }

    it.effect("rejects invalid hook input before creating a project", () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        yield* cli.run(
          "create",
          "invalid-hooks",
          "--target",
          target,
          "--yes",
          "--root",
          cli.workdir,
          "--git-hooks",
          "husky",
          "--runtime",
          "bun",
          "--package-manager",
          "bun",
        );
        yield* cli.expectExitCode(1);
        yield* cli.expectFileNotExists("invalid-hooks");
      }).pipe(Effect.provide(CLI.layer)),
    );

    it.effect("preserves TypeScript-owned prepare for versions 6 and 7", () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const cases = [
          { typescript: "6", prepare: "effect-language-service patch" },
          { typescript: "7", prepare: "effect-tsgo patch" },
        ] as const;

        yield* Effect.forEach(cases, ({ typescript, prepare }) =>
          Effect.forEach(["lefthook", "husky"] as const, (provider) =>
            Effect.gen(function* () {
              const output = yield* runPreview(
                cli,
                `typescript-${typescript}-${provider}`,
                "--runtime",
                "node",
                "--package-manager",
                "npm",
                "--typescript",
                typescript,
                "--git-hooks",
                provider,
              );
              expectContains(output, `\"prepare\": \"${prepare}\"`);
              expectExcludes(output, '"postinstall"', "husky init", "chmod");
            }),
          ),
        );
      }).pipe(Effect.provide(CLI.layer)),
    );
  });
});
