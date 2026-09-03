import { assert, describe, layer } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { CLI } from "./harness";

const huskyTarget = "workspace/root:workspace-devenv-husky";

describe("Husky", () => {
  layer(CLI.layer)("layer", (it) => {
    it.effect(
      "rejects create selections that combine Husky with --no-git before writing a project",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "husky-no-git-app",
            "--yes",
            "--no-git",
            "--target",
            huskyTarget,
            "--root",
            cli.workdir,
          );

          yield* cli.expectExitCode(1);
          yield* cli.expectErrorContaining("Husky");
          yield* cli.expectErrorContaining("Git");
          yield* cli.expectErrorContaining("--no-git");
          yield* cli.expectFileNotExists("husky-no-git-app");
          yield* cli.expectFileNotExists("husky-no-git-app/stack.effect.json");
          yield* cli.expectFileNotExists("husky-no-git-app/.git");
          yield* cli.expectFileNotExists("husky-no-git-app/.husky");
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "adds Husky with a static lint-staged JSON config",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("init", "husky-app", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);
          yield* cli.run(
            "add",
            "--yes",
            "--target",
            huskyTarget,
            "--root",
            `${cli.workdir}/husky-app`,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("husky-app/.husky/pre-commit");
          yield* cli.expectFileExists("husky-app/.lintstagedrc.json");
          yield* cli.expectFileNotExists("husky-app/lint-staged.config.mjs");
          yield* cli.expectFileContaining(
            "husky-app/.lintstagedrc.json",
            '"bun run --if-present format --"',
          );
          yield* cli.expectFileContaining(
            "husky-app/.lintstagedrc.json",
            '"bun run lint:fix --"',
          );
          yield* cli.expectFileContaining(
            "husky-app/.lintstagedrc.json",
            /^(?![\s\S]*\b(?:oxfmt|oxlint|biome|dprint)\b)[\s\S]*$/,
          );
          yield* cli.expectJsonFile(
            "husky-app/package.json",
            "scripts.prepare",
            "effect-tsgo patch && husky",
          );
          yield* cli.expectJsonFile(
            "husky-app/package.json",
            "scripts.format",
            "oxfmt",
          );
          yield* cli.expectJsonFile(
            "husky-app/package.json",
            "scripts.lint:fix",
            "oxlint --fix",
          );
          yield* cli.expectJsonFile(
            "husky-app/package.json",
            "scripts.lint-staged",
            "lint-staged",
          );
          yield* cli.expectFileContaining(
            "husky-app/package.json",
            /^(?![\s\S]*"husky:(?:format|install|lint)"\s*:)[\s\S]*$/,
          );
        }),
      { timeout: 120_000 },
    );

    it.effect(
      "activates Husky hooks immediately after create because install precedes Git initialization",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "husky-prepare-app",
            "--yes",
            "--target",
            huskyTarget,
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);
          yield* cli.expectJsonFile(
            "husky-prepare-app/package.json",
            "scripts.prepare",
            "effect-tsgo patch && husky",
          );

          yield* cli.withinProject("husky-prepare-app", function* (project) {
            const hooksPath = yield* project.exec(
              "git",
              "config",
              "--get",
              "core.hooksPath",
            );
            assert.strictEqual(
              hooksPath.stdout.trim(),
              ".husky/_",
              "post-finalize Husky activation must run after Git initialization",
            );
            yield* project.expectFileExists(".husky/_/h");

            // A later prepare must remain safe for clone/reinstall lifecycle use.

            const prepare = yield* project.exec("bun", "run", "prepare");
            assert.strictEqual(
              prepare.exitCode,
              0,
              `${prepare.stdout}\n${prepare.stderr}`,
            );
          });
        }),
      { timeout: 180_000 },
    );

    it.effect(
      "adds Husky without replaying Git bootstrap and commits only formatted staged content",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const initialHead = yield* Ref.make("");

          yield* cli.run(
            "init",
            "husky-git-app",
            "--yes",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("husky-git-app", function* (project) {
            const head = yield* project.exec("git", "rev-parse", "HEAD");
            assert.strictEqual(
              head.exitCode,
              0,
              `${head.stdout}\n${head.stderr}`,
            );
            yield* Ref.set(initialHead, head.stdout.trim());
            yield* project.writeFile("unrelated.txt", "leave this unstaged\n");
          });

          yield* cli.run(
            "add",
            "--yes",
            "--target",
            huskyTarget,
            "--root",
            `${cli.workdir}/husky-git-app`,
          );
          yield* cli.expectExitCode(0);
          yield* cli.expectFileContaining(
            "husky-git-app/.lintstagedrc.json",
            /run --if-present format --"[\s\S]*run lint:fix --"/,
          );

          yield* cli.withinProject("husky-git-app", function* (project) {
            const head = yield* project.exec("git", "rev-parse", "HEAD");
            assert.strictEqual(
              head.stdout.trim(),
              yield* Ref.get(initialHead),
              "Incremental add must not advance HEAD",
            );
            const staged = yield* project.exec(
              "git",
              "diff",
              "--cached",
              "--quiet",
            );
            assert.strictEqual(
              staged.exitCode,
              0,
              "Incremental add must not stage unrelated work",
            );
            const status = yield* project.exec("git", "status", "--short");
            assert.match(status.stdout, /\?\? unrelated\.txt/);
            yield* project.expectFileContaining(
              "package.json",
              '"prepare": "effect-tsgo patch && husky"',
            );
            yield* project.expectCommandSucceeds(
              "Effect TypeScript and Husky setup",
              "bun",
              "run",
              "prepare",
            );

            const stagedContents = "export const formatMe={value:'staged'}\n";
            yield* project.writeFile("staged.ts", stagedContents);
            yield* project.expectCommandSucceeds(
              "Stage source",
              "git",
              "add",
              "staged.ts",
            );
            yield* project.writeFile(
              "staged.ts",
              `${stagedContents}// local suffix\n`,
            );

            const commit = yield* project.exec(
              "git",
              "commit",
              "-m",
              "hook-test",
            );
            assert.strictEqual(
              commit.exitCode,
              0,
              `${commit.stdout}\n${commit.stderr}`,
            );
            const committedFile = yield* project.exec(
              "git",
              "show",
              "HEAD:staged.ts",
            );
            assert.strictEqual(
              committedFile.stdout,
              'export const formatMe = { value: "staged" };\n',
            );
            yield* project.expectFileContaining("staged.ts", "// local suffix");
            yield* project.expectFileContaining(
              "unrelated.txt",
              "leave this unstaged",
            );
            const unrelatedInCommit = yield* project.exec(
              "git",
              "cat-file",
              "-e",
              "HEAD:unrelated.txt",
            );
            assert.notStrictEqual(unrelatedInCommit.exitCode, 0);
            assert.notInclude(committedFile.stdout, "// local suffix");
          });
        }),
      { timeout: 180_000 },
    );

    it.effect(
      "adding Husky does not bootstrap an existing unborn repository",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "husky-unborn-git-app",
            "--yes",
            "--no-git",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("husky-unborn-git-app", function* (project) {
            yield* project.expectCommandSucceeds(
              "Initialize an unborn Git repository",
              "git",
              "init",
              "--initial-branch=main",
            );
            yield* project.writeFile("unrelated.txt", "leave this untracked\n");
          });

          yield* cli.run(
            "add",
            "--yes",
            "--target",
            huskyTarget,
            "--root",
            `${cli.workdir}/husky-unborn-git-app`,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("husky-unborn-git-app", function* (project) {
            const head = yield* project.exec(
              "git",
              "rev-parse",
              "--verify",
              "HEAD",
            );
            assert.notStrictEqual(
              head.exitCode,
              0,
              "Incremental add must not create an initial commit",
            );
            const staged = yield* project.exec(
              "git",
              "diff",
              "--cached",
              "--quiet",
            );
            assert.strictEqual(
              staged.exitCode,
              0,
              "Incremental add must leave the index empty",
            );
            const index = yield* project.exec("git", "ls-files");
            assert.strictEqual(
              index.stdout,
              "",
              "Incremental add must not stage generated or unrelated files",
            );
            const status = yield* project.exec("git", "status", "--short");
            assert.match(status.stdout, /\?\? unrelated\.txt/);
          });
        }),
      { timeout: 120_000 },
    );
  });
});
