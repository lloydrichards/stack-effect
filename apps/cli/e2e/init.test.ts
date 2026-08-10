import { describe, layer } from "@effect/vitest";
import { Effect } from "effect";
import { CLI } from "./harness";

/**
 * Acceptance tests for `stack-effect init`.
 *
 * Each test reads like a user story:
 * "When I init a project with --yes, then I expect it to build/lint/type-check."
 */
describe("init", () => {
  layer(CLI.layer)("layer", (it) => {
    it.effect(
      "creates a project with default options",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "my-app", "--yes", "--root", cli.workdir);

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("my-app/package.json");
          yield* cli.expectFileExists("my-app/tsconfig.json");
          yield* cli.expectJsonFile("my-app/package.json", "name", "my-app");
          yield* cli.expectJsonFile(
            "my-app/stack.effect.json",
            "typescript",
            "6",
          );
          yield* cli.expectJsonFile(
            "my-app/package.json",
            "scripts.prepare",
            "effect-language-service patch",
          );
          yield* cli.expectJsonFile(
            "my-app/package.json",
            "devDependencies.typescript",
            "6.0.3",
          );
          yield* cli.expectJsonFile(
            "my-app/package.json",
            "devDependencies.@effect/language-service",
            "^0.87.0",
          );
          yield* cli.expectJsonFile(
            "my-app/tsconfig.json",
            "$schema",
            "./node_modules/@effect/language-service/schema.json",
          );
          yield* cli.expectJsonFile(
            "my-app/packages/config-typescript/base.json",
            "$schema",
            "../../node_modules/@effect/language-service/schema.json",
          );
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "records an explicit TypeScript version",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "typescript-7-app",
            "--yes",
            "--typescript",
            "7",
            "--root",
            cli.workdir,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectJsonFile(
            "typescript-7-app/stack.effect.json",
            "typescript",
            "7",
          );
          yield* cli.expectJsonFile(
            "typescript-7-app/package.json",
            "scripts.prepare",
            "effect-tsgo patch",
          );
          yield* cli.expectJsonFile(
            "typescript-7-app/package.json",
            "devDependencies.typescript",
            "7.0.2",
          );
          yield* cli.expectJsonFile(
            "typescript-7-app/package.json",
            "devDependencies.@effect/tsgo",
            "^0.22.0",
          );
          yield* cli.expectJsonFile(
            "typescript-7-app/tsconfig.json",
            "$schema",
            "./node_modules/@effect/tsgo/schema.json",
          );
          yield* cli.expectJsonFile(
            "typescript-7-app/packages/config-typescript/base.json",
            "$schema",
            "../../node_modules/@effect/tsgo/schema.json",
          );
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "should generate only Turbo orchestration when using the default monorepo",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "mono-app", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.expectFileExists("mono-app/turbo.json");
          yield* cli.expectFileExists("mono-app/biome.jsonc");
          yield* cli.expectFileExists("mono-app/package.json");
          yield* cli.expectFileNotExists("mono-app/vite.config.ts");
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.build",
            "turbo run build",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.dev",
            "turbo run dev",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.type-check",
            "turbo run type-check",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.test",
            "turbo run test",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.clean",
            "turbo run clean && git clean -xdf node_modules .cache .turbo dist tsconfig.tsbuildinfo",
          );
          yield* cli.expectFileContaining(
            "mono-app/package.json",
            /^(?![\s\S]*"vite-plus"\s*:)[\s\S]*$/,
          );
          yield* cli.expectFileContaining(
            "mono-app/.gitignore",
            /^(?![\s\S]*node_modules\/\.vite\/task-cache)[\s\S]*$/,
          );
          yield* cli.expectFileContaining(
            "mono-app/package.json",
            /"build": "turbo run build"[\s\S]*"dev": "turbo run dev"[\s\S]*"type-check": "turbo run type-check"[\s\S]*"clean": "turbo run clean[^\n]+"[\s\S]*"format":[\s\S]*"lint":[\s\S]*"test": "turbo run test"/,
          );
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "should remain valid and idempotent when an Oxfmt workspace is generated",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "oxfmt-app",
            "--target",
            "package/domain:domain-api-contracts",
            "--yes",
            "--format",
            "oxfmt",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("oxfmt-app/.oxfmtrc.jsonc");
          yield* cli.expectFileExists("oxfmt-app/.vscode/settings.json");
          yield* cli.expectFileExists("oxfmt-app/.vscode/extensions.json");
          yield* cli.expectFileNotExists("oxfmt-app/dprint.json");
          yield* cli.expectFileContaining(
            "oxfmt-app/biome.jsonc",
            /^(?![\s\S]*"formatter"\s*:)[\s\S]*$/,
          );

          yield* cli.withinProject("oxfmt-app", function* (project) {
            yield* project.expectInstallSucceeds();
            yield* project.expectFormatPasses();
            yield* project.expectLintPasses();
            yield* project.expectTypeCheckPasses();
            yield* project.expectCommandSucceeds(
              "Tests",
              "bun",
              "run",
              "test",
              "--",
              "--",
              "--passWithNoTests",
            );
            yield* project.expectBuildSucceeds();

            yield* project.writeFile("generated/invalid.ts", "const =\n");
            yield* project.expectCommandSucceeds(
              "First format",
              "bun",
              "run",
              "format",
            );
            yield* project.expectCommandSucceeds(
              "Stage first format",
              "git",
              "add",
              "-A",
            );
            yield* project.expectCommandSucceeds(
              "Second format",
              "bun",
              "run",
              "format",
            );
            yield* project.expectCommandSucceeds(
              "Idempotency diff",
              "git",
              "diff",
              "--exit-code",
            );
            yield* project.expectFormatPasses();
            yield* project.expectFileContaining(
              "generated/invalid.ts",
              "const =\n",
            );
          });
        }),
      { timeout: 120_000 },
    );

    it.effect(
      "should select Oxfmt when the catalog workspace is reset",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "catalog",
            "workspace",
            "reset",
            "--format",
            "oxfmt",
            "--root",
            `${cli.workdir}/catalog-oxfmt`,
          );
          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("catalog-oxfmt/.oxfmtrc.jsonc");
          yield* cli.expectFileNotExists("catalog-oxfmt/dprint.json");
          yield* cli.expectJsonFile(
            "catalog-oxfmt/package.json",
            "scripts.format",
            "oxfmt",
          );
          yield* cli.expectJsonFile(
            "catalog-oxfmt/package.json",
            "devDependencies.oxfmt",
            "^0.62.0",
          );
          yield* cli.expectFileContaining(
            "catalog-oxfmt/.catalog-build-manifest.json",
            '"moduleId": "workspace-quality-oxfmt"',
          );
        }),
      { timeout: 120_000 },
    );

    it.effect(
      "should generate only Vite+ orchestration when Vite+ is selected",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "vite-plus-app",
            "--target",
            "package/domain:domain-api-contracts",
            "--yes",
            "--no-git",
            "--monorepo",
            "vite-plus",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.expectFileExists("vite-plus-app/vite.config.ts");
          yield* cli.expectFileContaining(
            "vite-plus-app/vite.config.ts",
            /cache:\s*\{\s*scripts: true,\s*tasks: true,/,
          );
          yield* cli.expectJsonFile(
            "vite-plus-app/package.json",
            "devDependencies.vite-plus",
            "^0.2.8",
          );
          yield* cli.expectJsonFile(
            "vite-plus-app/package.json",
            "scripts.build",
            "vp run -r build",
          );
          yield* cli.expectJsonFile(
            "vite-plus-app/package.json",
            "scripts.dev",
            "vp run -r --parallel --no-cache dev",
          );
          yield* cli.expectJsonFile(
            "vite-plus-app/package.json",
            "scripts.type-check",
            "vp run -r type-check",
          );
          yield* cli.expectJsonFile(
            "vite-plus-app/package.json",
            "scripts.test",
            "vp run -r test",
          );
          yield* cli.expectJsonFile(
            "vite-plus-app/package.json",
            "scripts.clean",
            'vp cache clean && vp run --no-cache --filter "./apps/*" --filter "./packages/*" clean && git clean -xdf node_modules .cache dist tsconfig.tsbuildinfo',
          );
          yield* cli.expectFileContaining(
            "vite-plus-app/.gitignore",
            "node_modules/.vite/task-cache",
          );
          yield* cli.expectFileNotExists("vite-plus-app/turbo.json");
          yield* cli.expectFileContaining(
            "vite-plus-app/package.json",
            /^(?![\s\S]*"turbo"\s*:)[\s\S]*$/,
          );
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "dry-run does not write files",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "ghost-app",
            "--yes",
            "--dry-run",
            "--root",
            cli.workdir,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectFileNotExists("ghost-app/package.json");
        }),
      { timeout: 15_000 },
    );

    it.effect(
      "created project passes lint",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "lint-app", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("lint-app", function* (project) {
            yield* project.expectLintPasses();
          });
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "created project passes format check",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "format-app", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("format-app", function* (project) {
            yield* project.expectFormatPasses();
          });
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "created project type-checks",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "typecheck-app",
            "--yes",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("typecheck-app", function* (project) {
            yield* project.expectTypeCheckPasses();
          });
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "init --yes --runtime node does not prompt (issue #66)",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "node-app",
            "--yes",
            "--runtime",
            "node",
            "--root",
            cli.workdir,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("node-app/package.json");
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "init --yes initializes a git repository by default",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "git-app", "--yes", "--root", cli.workdir);

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("git-app/.git/HEAD");
          yield* cli.expectFileContaining(
            "git-app/.git/HEAD",
            "refs/heads/main",
          );
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "init --yes --no-git skips git initialization",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "nogit-app",
            "--yes",
            "--no-git",
            "--root",
            cli.workdir,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("nogit-app/package.json");
          yield* cli.expectFileNotExists("nogit-app/.git");
        }),
      { timeout: 30_000 },
    );
  });
});
