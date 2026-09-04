import { assert, describe, layer } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { CLI } from "./harness";

const huskyTarget = "workspace/root:workspace-devenv-husky";

describe("Husky", () => {
  layer(CLI.layer)("layer", (it) => {
    it.effect(
      "rejects Husky with --no-git before writing a project",
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
          yield* cli.expectErrorContaining("--no-git");
          yield* cli.expectFileNotExists("husky-no-git-app");
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "activates Husky after creating the Git repository",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          yield* cli.run(
            "create",
            "husky-postprepare-app",
            "--yes",
            "--target",
            huskyTarget,
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject(
            "husky-postprepare-app",
            function* (project) {
              const hooksPath = yield* project.exec(
                "git",
                "config",
                "--get",
                "core.hooksPath",
              );
              assert.strictEqual(hooksPath.stdout.trim(), ".husky/_");
              yield* project.expectFileContaining(
                "package.json",
                '"postprepare": "husky"',
              );
            },
          );
        }),
      { timeout: 180_000 },
    );

    it.effect(
      "preserves an existing repository and commits only formatted staged content",
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

          yield* cli.withinProject("husky-git-app", function* (project) {
            const head = yield* project.exec("git", "rev-parse", "HEAD");
            assert.strictEqual(
              head.stdout.trim(),
              yield* Ref.get(initialHead),
              "Adding Husky must not advance HEAD",
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
              "Adding Husky must not stage files",
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
            assert.notInclude(committedFile.stdout, "// local suffix");
            yield* project.expectFileContaining("staged.ts", "// local suffix");
          });
        }),
      { timeout: 180_000 },
    );
  });
});
