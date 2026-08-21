import { assert, describe, layer } from "@effect/vitest";
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
            "7",
          );
          yield* cli.expectJsonFile(
            "my-app/package.json",
            "scripts.prepare",
            "effect-tsgo patch",
          );
          yield* cli.expectJsonFile(
            "my-app/package.json",
            "devDependencies.typescript",
            "7.0.2",
          );
          yield* cli.expectJsonFile(
            "my-app/package.json",
            "devDependencies.@effect/tsgo",
            "^0.22.0",
          );
          yield* cli.expectJsonFile(
            "my-app/tsconfig.json",
            "$schema",
            "./node_modules/@effect/tsgo/schema.json",
          );
          yield* cli.expectJsonFile(
            "my-app/packages/config-typescript/base.json",
            "$schema",
            "../../node_modules/@effect/tsgo/schema.json",
          );
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "records an explicit TypeScript 6 override",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "typescript-6-app",
            "--yes",
            "--typescript",
            "6",
            "--root",
            cli.workdir,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectJsonFile(
            "typescript-6-app/stack.effect.json",
            "typescript",
            "6",
          );
          yield* cli.expectJsonFile(
            "typescript-6-app/package.json",
            "scripts.prepare",
            "effect-language-service patch",
          );
          yield* cli.expectJsonFile(
            "typescript-6-app/package.json",
            "devDependencies.typescript",
            "6.0.3",
          );
          yield* cli.expectJsonFile(
            "typescript-6-app/package.json",
            "devDependencies.@effect/language-service",
            "^0.87.0",
          );
          yield* cli.expectJsonFile(
            "typescript-6-app/tsconfig.json",
            "$schema",
            "./node_modules/@effect/language-service/schema.json",
          );
          yield* cli.expectJsonFile(
            "typescript-6-app/packages/config-typescript/base.json",
            "$schema",
            "../../node_modules/@effect/language-service/schema.json",
          );
        }),
      { timeout: 60_000 },
    );

    it.effect(
      "should generate the Vite+ toolchain when using the defaults",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "mono-app", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.expectFileNotExists("mono-app/turbo.json");
          yield* cli.expectFileNotExists("mono-app/biome.jsonc");
          yield* cli.expectFileExists("mono-app/vite.config.ts");
          yield* cli.expectFileExists("mono-app/.oxfmtrc.jsonc");
          yield* cli.expectFileExists("mono-app/package.json");
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.build",
            "vp run -r build",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.dev",
            "vp run -r --parallel --no-cache dev",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.type-check",
            "vp run -r type-check",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.test",
            "vp run -r test",
          );
          yield* cli.expectJsonFile(
            "mono-app/package.json",
            "scripts.clean",
            'vp cache clean && vp run --no-cache --filter "./apps/*" --filter "./packages/*" clean && git clean -xdf node_modules .cache dist tsconfig.tsbuildinfo',
          );
          yield* cli.expectFileContaining(
            "mono-app/package.json",
            /"vite-plus"\s*:/,
          );
          yield* cli.expectFileContaining(
            "mono-app/.gitignore",
            /node_modules\/\.vite\/task-cache/,
          );
          yield* cli.expectFileContaining(
            "mono-app/package.json",
            /"build": "vp run -r build"[\s\S]*"dev": "vp run -r --parallel --no-cache dev"[\s\S]*"type-check": "vp run -r type-check"[\s\S]*"clean": "vp cache clean[^\n]+"[\s\S]*"format":[\s\S]*"lint":[\s\S]*"test": "vp run -r test"/,
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
          yield* cli.expectFileNotExists("oxfmt-app/biome.jsonc");

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
      "should create, type-check, test, and build a TypeScript 7 Bun workspace with Nx",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "nx-bun-app",
            "--target",
            "client-react/web:client-react-http-api",
            "--target",
            "server/api:server-http-api",
            "--yes",
            "--no-git",
            "--monorepo",
            "nx",
            "--typescript",
            "7",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.expectFileExists("nx-bun-app/nx.json");
          yield* cli.expectFileExists("nx-bun-app/scripts/hash-env.mjs");
          yield* cli.expectFileNotExists("nx-bun-app/turbo.json");
          yield* cli.expectFileNotExists("nx-bun-app/vite.config.ts");
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "devDependencies.nx",
            "^23.1.1",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "devDependencies.typescript",
            "7.0.2",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "devDependencies.@effect/tsgo",
            "^0.22.0",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "scripts.prepare",
            "effect-tsgo patch",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "scripts.build",
            "nx run-many -t build",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "scripts.dev",
            "nx run-many -t dev",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "scripts.type-check",
            "nx run-many -t type-check",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "scripts.test",
            "nx run-many -t test",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/package.json",
            "scripts.clean",
            "nx reset && nx run-many -t clean && git clean -xdf node_modules .cache .nx/cache .nx/workspace-data dist tsconfig.tsbuildinfo",
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/nx.json",
            "pluginsConfig.@nx/js.analyzeLockfile",
            false,
          );
          yield* cli.expectJsonFile(
            "nx-bun-app/nx.json",
            "pluginsConfig.@nx/js.analyzeSourceFiles",
            false,
          );
          yield* cli.expectFileContaining(
            "nx-bun-app/.gitignore",
            ".nx/workspace-data",
          );
          yield* cli.expectFileContaining(
            "nx-bun-app/package.json",
            /^(?![\s\S]*"turbo"\s*:)(?![\s\S]*"nx"\s*:\s*\{)[\s\S]*$/,
          );
          yield* cli.expectFileContaining(
            "nx-bun-app/nx.json",
            '"{workspaceRoot}/bun.lock"',
          );

          yield* cli.withinProject("nx-bun-app", function* (project) {
            const discovered = yield* project.exec(
              "bunx",
              "nx",
              "show",
              "projects",
            );
            assert.strictEqual(
              discovered.exitCode,
              0,
              `${discovered.stdout}\n${discovered.stderr}`,
            );
            assert.match(discovered.stdout, /client-react-web/);
            assert.match(discovered.stdout, /server-api/);
            assert.isFalse(/nx-bun-app/.test(discovered.stdout));

            yield* project.expectTypeCheckPasses();
            yield* project.expectBuildSucceeds();
            yield* project.expectTestsPasses();

            const cached = yield* project.exec("bun", "run", "build");
            assert.strictEqual(cached.exitCode, 0);
            assert.match(cached.stdout, /read the output from the cache/i);

            yield* project.writeFile(
              "apps/client-react-web/.env.local",
              "NX_GAUNTLET_SECRET=must-not-appear-in-nx-output\n",
            );
            const digest = yield* project.exec("node", "scripts/hash-env.mjs");
            assert.strictEqual(digest.exitCode, 0);
            assert.match(digest.stdout, /^[a-f0-9]{64}$/);
            assert.strictEqual(digest.stderr, "");

            const invalidated = yield* project.exec("bun", "run", "build");
            const invalidatedOutput = `${invalidated.stdout}\n${invalidated.stderr}`;
            assert.strictEqual(invalidated.exitCode, 0);
            assert.isFalse(
              /read the output from the cache/i.test(invalidatedOutput),
            );
            assert.isFalse(
              /must-not-appear-in-nx-output/.test(invalidatedOutput),
            );

            const projectEnvCached = yield* project.exec("bun", "run", "build");
            assert.match(
              projectEnvCached.stdout,
              /read the output from the cache/i,
            );
            yield* project.writeFile(
              ".env",
              "NX_ROOT_GAUNTLET_SECRET=also-must-not-appear\n",
            );
            const rootEnvInvalidated = yield* project.exec(
              "bun",
              "run",
              "build",
            );
            const rootEnvOutput = `${rootEnvInvalidated.stdout}\n${rootEnvInvalidated.stderr}`;
            assert.strictEqual(rootEnvInvalidated.exitCode, 0);
            assert.isFalse(
              /read the output from the cache/i.test(rootEnvOutput),
            );
            assert.isFalse(/also-must-not-appear/.test(rootEnvOutput));
          });
        }),
      { timeout: 180_000 },
    );

    it.effect(
      "should create, discover, type-check, and build a TypeScript 7 Node and npm workspace with Nx",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "nx-npm-app",
            "--target",
            "client-react/web:client-react-web-worker",
            "--yes",
            "--no-git",
            "--runtime",
            "node",
            "--package-manager",
            "npm",
            "--monorepo",
            "nx",
            "--typescript",
            "7",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);
          yield* cli.expectFileContaining(
            "nx-npm-app/nx.json",
            /^(?![\s\S]*analyzeLockfile)[\s\S]*$/,
          );
          yield* cli.expectJsonFile(
            "nx-npm-app/nx.json",
            "pluginsConfig.@nx/js.analyzeSourceFiles",
            false,
          );

          yield* cli.withinProject("nx-npm-app", function* (project) {
            const discovered = yield* project.exec(
              "npm",
              "exec",
              "nx",
              "show",
              "projects",
            );
            assert.strictEqual(discovered.exitCode, 0);
            assert.match(discovered.stdout, /client-react-web/);
            assert.isFalse(/nx-npm-app/.test(discovered.stdout));
            yield* project.expectTypeCheckPasses("npm");
            yield* project.expectBuildSucceeds("npm");
          });
        }),
      { timeout: 180_000 },
    );

    it.effect(
      "should install and discover projects with Nx in a Node and pnpm workspace",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "nx-pnpm-app",
            "--target",
            "package/domain:domain-api-contracts",
            "--yes",
            "--no-git",
            "--runtime",
            "node",
            "--package-manager",
            "pnpm",
            "--monorepo",
            "nx",
            "--typescript",
            "6",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);
          yield* cli.expectFileContaining(
            "nx-pnpm-app/pnpm-workspace.yaml",
            /allowBuilds:[\s\S]*nx: true/,
          );
          yield* cli.expectFileContaining(
            "nx-pnpm-app/nx.json",
            /^(?![\s\S]*analyzeLockfile)[\s\S]*$/,
          );

          yield* cli.withinProject("nx-pnpm-app", function* (project) {
            const discovered = yield* project.exec(
              "pnpm",
              "exec",
              "nx",
              "show",
              "projects",
            );
            assert.strictEqual(discovered.exitCode, 0);
            assert.match(discovered.stdout, /@repo\/domain/);
            assert.isFalse(/nx-pnpm-app/.test(discovered.stdout));
            yield* project.expectTypeCheckPasses("pnpm");
          });
        }),
      { timeout: 180_000 },
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
