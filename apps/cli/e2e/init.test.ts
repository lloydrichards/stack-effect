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

          yield* cli.run(
            "init",
            "my-app",
            "--yes",
            "--root",
            `${cli.workdir}/my-app`,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("my-app/package.json");
          yield* cli.expectFileExists("my-app/tsconfig.json");
          yield* cli.expectJsonFile("my-app/package.json", "name", "my-app");
        }),
      { timeout: 30_000 },
    );

    it.effect(
      "scaffolds expected monorepo structure",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "mono-app",
            "--yes",
            "--root",
            `${cli.workdir}/mono-app`,
          );
          yield* cli.expectExitCode(0);

          yield* cli.expectFileExists("mono-app/turbo.json");
          yield* cli.expectFileExists("mono-app/biome.jsonc");
          yield* cli.expectFileExists("mono-app/package.json");
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
            `${cli.workdir}/ghost-app`,
          );

          yield* cli.expectExitCode(1);
          yield* cli.expectFileNotExists("ghost-app/package.json");
        }),
      { timeout: 15_000 },
    );

    it.effect(
      "created project passes lint",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "init",
            "lint-app",
            "--yes",
            "--root",
            `${cli.workdir}/lint-app`,
          );
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

          yield* cli.run(
            "init",
            "format-app",
            "--yes",
            "--root",
            `${cli.workdir}/format-app`,
          );
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
            `${cli.workdir}/typecheck-app`,
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
            `${cli.workdir}/node-app`,
          );

          yield* cli.expectExitCode(0);
          yield* cli.expectFileExists("node-app/package.json");
        }),
      { timeout: 30_000 },
    );
  });
});
