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
      "fails fast when --yes --target is missing a value",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("add", "--yes", "--target");
          yield* cli.expectExitCode(1);
          yield* cli.expectErrorContaining("Missing value for --target");
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 30_000 },
    );

    it.effect(
      "adds a domain-api-contracts module to a package target",
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
            "package/domain:domain-api-contracts",
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
      "resolves cross-target implications in non-interactive mode",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/impl-test`;

          yield* cli.run("init", "impl-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "client-react/web:client-react-http-api",
          );
          yield* cli.expectExitCode(0);
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 90_000 },
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
            "package/domain:domain-api-contracts",
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

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/domain:domain-api-contracts",
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "server/api:server-http-api",
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "client-react/web:client-react-http-api",
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

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "server/api:server-chat-rpc",
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
      "ai module scaffolds with correct domain-chat-contracts dependency (issue #77)",
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
            "package/ai:package-ai-core",
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

    it.effect(
      "chat ask command scaffolds CLI driver and AI dependencies",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/ask-test`;

          yield* cli.run("init", "ask-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "cli/app:cli-command-chat-ask",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("ask-test", function* (project) {
            yield* project.expectDirectoryExactly("apps", ["cli-app"]);
            yield* project.expectFileExists("apps/cli-app/src/commands/ask.ts");
            yield* project.expectFileExists(
              "apps/cli-app/src/chat/ChatDriver.ts",
            );
            yield* project.expectFileExists("packages/ai/package.json");
            yield* project.expectFileExists("packages/domain/package.json");
            yield* project.expectFileContaining(
              "apps/cli-app/src/index.ts",
              "ask",
            );
            yield* project.expectFileContaining(
              "apps/cli-app/package.json",
              '"@repo/ai": "workspace:*"',
            );
            yield* project.expectFileContaining(
              "apps/cli-app/package.json",
              '"@repo/domain": "workspace:*"',
            );
            yield* project.expectTypeCheckPasses();
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 120_000 },
    );

    it.effect(
      "terminal chat command scaffolds interactive CLI chat without ask command",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/terminal-chat-test`;

          yield* cli.run(
            "init",
            "terminal-chat-test",
            "--yes",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "cli/custom:cli-command-chat-terminal",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("terminal-chat-test", function* (project) {
            yield* project.expectDirectoryExactly("apps", ["cli-custom"]);
            yield* project.expectFileExists(
              "apps/cli-custom/src/commands/chat.ts",
            );
            yield* project.expectFileExists(
              "apps/cli-custom/src/chat/TerminalChat.ts",
            );
            yield* project.expectFileExists(
              "apps/cli-custom/src/chat/ChatDriver.ts",
            );
            yield* project.expectFileExists("packages/ai/package.json");
            yield* project.expectFileExists("packages/domain/package.json");
            yield* project.expectFileContaining(
              "apps/cli-custom/src/index.ts",
              "chat",
            );
            yield* project.expectFileContaining(
              "apps/cli-custom/package.json",
              '"@repo/ai": "workspace:*"',
            );
            yield* project.expectFileContaining(
              "apps/cli-custom/package.json",
              '"@repo/domain": "workspace:*"',
            );
            yield* project.expectFileContaining(
              "apps/cli-custom/package.json",
              '"effect-boxes": "^0.16.1"',
            );
            yield* project.expectFileNotExists(
              "apps/cli-custom/src/commands/ask.ts",
            );
            yield* project.expectFileNotExists("apps/server-api/package.json");
            yield* project.expectTypeCheckPasses();
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 120_000 },
    );

    it.effect(
      "client-foldkit target scaffolds with rest module when server exists",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/foldkit-test`;

          yield* cli.run(
            "init",
            "foldkit-test",
            "--yes",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/domain:domain-api-contracts",
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "server/api:server-http-api",
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "client-foldkit/app:client-foldkit-http-api",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("foldkit-test", function* (project) {
            yield* project.expectFileExists(
              "apps/client-foldkit-app/package.json",
            );
            yield* project.expectFileExists(
              "apps/client-foldkit-app/src/main.ts",
            );
            yield* project.expectFileExists(
              "apps/client-foldkit-app/src/features/rest.ts",
            );
            yield* project.expectTypeCheckPasses();
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 120_000 },
    );

    it.effect(
      "resolves client-foldkit cross-target implications in non-interactive mode",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/foldkit-impl`;

          yield* cli.run(
            "init",
            "foldkit-impl",
            "--yes",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "client-foldkit/app:client-foldkit-http-api",
          );
          yield* cli.expectExitCode(0);
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 30_000 },
    );
  });
});
