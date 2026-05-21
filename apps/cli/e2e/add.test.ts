import { describe, layer } from "@effect/vitest";
import { Effect } from "effect";
import { CLI } from "./harness";

/**
 * Acceptance tests for `stack-effect add`.
 *
 * Each test scaffolds a project first, then adds modules and verifies
 * the result is a working project.
 */
describe("add", () => {
  layer(CLI.layer)("layer", (it) => {
    it.effect(
      "adds a domain-api module to a package target",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/add-test`;

          yield* cli.run("init", "add-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/domain",
            "--modules",
            "domain-api",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("add-test", function* (project) {
            yield* project.expectFileExists("packages/domain/package.json");
            yield* project.expectTypeCheckPasses();
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 90_000 },
    );

    it.effect(
      "rejects cross-target implications in non-interactive mode",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/impl-test`;

          yield* cli.run("init", "impl-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          // http-api-client implies http-api-server on server — rejected non-interactively
          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "client-react/web",
            "--modules",
            "http-api-client",
          );
          yield* cli.expectExitCode(1);
          yield* cli.expectOutputContaining("implies");
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 30_000 },
    );

    it.effect(
      "dry-run add previews without writing",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/dry-add`;

          yield* cli.run("init", "dry-add", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/domain",
            "--modules",
            "domain-api",
            "--dry-run",
          );
          yield* cli.expectExitCode(0);

          yield* cli.expectFileNotExists(
            "dry-add/packages/domain/package.json",
          );
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 30_000 },
    );

    it.effect(
      "allows client module when implied server target already exists (issue #78)",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/impl-exists`;

          yield* cli.run("init", "impl-exists", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          // First add domain-api (required by server)
          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/domain",
            "--modules",
            "domain-api",
          );
          yield* cli.expectExitCode(0);

          // Add server module first
          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "server/api",
            "--modules",
            "http-api-server",
          );
          yield* cli.expectExitCode(0);

          // Now add client module — should succeed since server already exists
          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "client-react/web",
            "--modules",
            "http-api-client",
            "--dry-run",
          );
          yield* cli.expectExitCode(0);
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 90_000 },
    );

    it.effect(
      "adding server module with required-module dep on package/domain succeeds (issue #76)",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/dep-test`;

          yield* cli.run("init", "dep-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          // Add chat-server which depends on domain-chat on package/domain
          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "server/api",
            "--modules",
            "chat-server",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("dep-test", function* (project) {
            yield* project.expectFileExists("packages/domain/package.json");
            yield* project.expectFileExists("apps/server-api/package.json");
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 90_000 },
    );

    it.effect(
      "ai module scaffolds with correct domain-chat dependency (issue #77)",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/ai-test`;

          yield* cli.run("init", "ai-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/ai",
            "--modules",
            "ai",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("ai-test", function* (project) {
            yield* project.expectFileExists("packages/ai/package.json");
            yield* project.expectFileExists("packages/domain/package.json");
            yield* project.expectTypeCheckPasses();
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 90_000 },
    );
  });
});
