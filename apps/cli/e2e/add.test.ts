import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { labsCatalogArgs } from "./fixtures/labs-source";
import { CLI } from "./harness";

/**
 * Acceptance tests for `stack-effect add`.
 *
 * Each test scaffolds a project first, then adds modules and verifies
 * the result is a working project.
 */
describe("add", () => {
  layer(CLI.layer)("layer", (it) => {
    it.effect("runs the Task Planner scratchpad without shipping tests", () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const name = "task-plan-demo";
        const testPath = "src/TaskPlan.test.ts";

        yield* cli.run(
          "create",
          name,
          ...labsCatalogArgs,
          "--target",
          "package/task-plan:package-task-plan",
          "--runtime",
          "bun",
          "--root",
          cli.workdir,
          "--yes",
          "--no-git",
        );
        yield* cli.expectExitCode(0);

        const fs = yield* FileSystem.FileSystem;
        const cases = yield* fs.readFileString(
          new URL("./fixtures/task-plan.test.ts.txt", import.meta.url).pathname,
        );
        yield* cli.withinProject(
          `${name}/packages/task-plan`,
          function* (planner) {
            yield* planner.expectFileNotExists(testPath);

            yield* planner.expectCommandSucceeds(
              "Task Planner scratchpad",
              "bun",
              "run",
              "scratch",
            );
            yield* planner.writeFile(
              "task-plan-export.ts",
              `import assert from "node:assert/strict";
import { planTasks } from "@repo/task-plan/TaskPlan";
assert.equal(typeof planTasks, "function");
`,
            );
            yield* planner.expectCommandSucceeds(
              "Task Planner package export",
              "bun",
              "task-plan-export.ts",
            );

            yield* planner.writeFile(testPath, cases);
            yield* planner.expectCommandSucceeds(
              "generated Task Planner cases",
              "bun",
              "run",
              "vitest",
              "run",
              testPath,
            );
          },
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("runs the offline GitHub issue demo without shipping tests", () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const name = "github-issue-demo";

        yield* cli.run(
          "create",
          name,
          ...labsCatalogArgs,
          "--target",
          "server/api:server-github-issue-label",
          "--runtime",
          "bun",
          "--root",
          cli.workdir,
          "--yes",
          "--no-git",
        );
        yield* cli.expectExitCode(0);

        yield* cli.withinProject(`${name}/apps/server-api`, function* (server) {
          yield* server.expectFileNotExists("src/webhooks/github.test.ts");

          const fixture = yield* server.exec("bun", "run", "fixture:github");
          assert.equal(fixture.exitCode, 0, fixture.stderr);
          assert.deepEqual(fixture.stdout.trim().split(/\r?\n/), [
            "Would add triage to demo/repo#3",
            "Opened issue: HTTP 204",
            "Would add triage to demo/repo#3",
            "Replay of the same issue: HTTP 204",
            "Closed issue: HTTP 204",
            "Tampered delivery: HTTP 401",
            "Malformed issue event: HTTP 400",
            "Oversized delivery: HTTP 413",
          ]);
        });
      }),
    );

    for (const [moduleId, feature] of [
      ["client-foldkit-http-rpc", "ticks"],
      ["client-foldkit-ws-presence", "presence"],
      ["client-foldkit-chat", "chat"],
    ] as const) {
      it.effect(
        `rejects ${moduleId} on a released Foldkit version before changing project files`,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const fs = yield* FileSystem.FileSystem;
            const name = `foldkit-legacy-${feature}`;
            const root = `${cli.workdir}/${name}`;
            yield* cli.run(
              "create",
              name,
              "--root",
              cli.workdir,
              "--target",
              "client-foldkit/app",
              "--target",
              "package/domain:domain-rpc-contracts",
              "--lint",
              "biome",
              "--yes",
              "--no-git",
            );
            yield* cli.expectExitCode(0);
            const manifestPath = `${root}/apps/client-foldkit-app/package.json`;
            const manifest = yield* fs.readFileString(manifestPath);
            assert.include(manifest, '"foldkit": "0.170.0"');
            yield* fs.writeFileString(
              manifestPath,
              manifest.replace('"foldkit": "0.170.0"', '"foldkit": "0.165.0"'),
            );
            const paths = [
              manifestPath,
              `${root}/apps/client-foldkit-app/src/main.ts`,
              `${root}/stack.effect.json`,
              `${root}/bun.lock`,
            ];
            const before = yield* Effect.forEach(paths, (path) =>
              fs.readFileString(path),
            );
            const result = yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              `client-foldkit/app:${moduleId}`,
            );
            assert.strictEqual(
              result.exitCode,
              1,
              result.stdout + result.stderr,
            );
            assert.match(result.stdout + result.stderr, /conflict/i);
            const after = yield* Effect.forEach(paths, (path) =>
              fs.readFileString(path),
            );
            assert.deepStrictEqual(after, before);
            assert.isFalse(
              yield* fs.exists(
                `${root}/apps/client-foldkit-app/src/features/${feature}.ts`,
              ),
            );
            assert.isFalse(yield* fs.exists(`${root}/apps/server-api`));
            yield* fs.writeFileString(manifestPath, manifest);
            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              `client-foldkit/app:${moduleId}`,
            );
            yield* cli.expectExitCode(0);
            yield* cli.withinProject(name, function* (project) {
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(NodeServices.layer)),
        { timeout: 120_000 },
      );
    }

    it.effect(
      "fails fast when --yes --target is missing a value",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run("add", "--yes", "--target");
          yield* cli.expectExitCode(1);
          yield* cli.expectErrorContaining("Missing value for");
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
      "generates Node-compatible package, server, and CLI targets",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/node-targets`;

          yield* cli.run(
            "init",
            "node-targets",
            "--yes",
            "--runtime",
            "node",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* Effect.forEach(
            [
              "package/domain:domain-api-contracts",
              "server/api:server-http-api",
              "server/api:server-chat-rpc",
              "cli/app:cli-command-hello",
            ],
            (target) =>
              Effect.gen(function* () {
                yield* cli.run(
                  "add",
                  "--yes",
                  "--root",
                  root,
                  "--target",
                  target,
                );
                yield* cli.expectExitCode(0);
              }),
            { discard: true },
          );

          yield* cli.withinProject("node-targets", function* (project) {
            yield* Effect.forEach(
              [
                "packages/domain/package.json",
                "apps/server-api/package.json",
                "apps/cli-app/package.json",
              ],
              (packageJson) =>
                project.expectFileContaining(
                  packageJson,
                  /^(?![\s\S]*@types\/bun)[\s\S]*$/,
                ),
              { discard: true },
            );

            yield* project.expectFileContaining(
              "apps/server-api/src/index.ts",
              'from "@effect/platform-node"',
            );
            yield* project.expectFileContaining(
              "apps/server-api/src/runtime/ChatSessions.ts",
              'from "@effect/platform-node/NodeCrypto"',
            );
            yield* project.expectFileContaining(
              "apps/server-api/src/runtime/ChatSessions.ts",
              /^(?![\s\S]*@effect\/platform-bun)[\s\S]*$/,
            );
            yield* project.expectFileContaining(
              "apps/cli-app/src/index.ts",
              'from "@effect/platform-node"',
            );
            yield* project.expectTypeCheckPasses("pnpm");
            yield* project.expectBuildSucceeds("pnpm");
          });
        }).pipe(Effect.provide(CLI.layer)),
      { timeout: 180_000 },
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

          yield* cli.withinProject("impl-test", function* (project) {
            yield* project.expectFileContaining(
              "apps/client-react-web/vite.config.ts",
              'fileURLToPath(new URL("./src", import.meta.url))',
            );
            yield* project.expectFileContaining(
              "apps/client-react-web/vite.config.ts",
              "@effect-diagnostics nodeBuiltinImport:off",
            );
          });
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
      "math toolkit preserves conventional exponent precedence",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const root = `${cli.workdir}/math-test`;

          yield* cli.run("init", "math-test", "--yes", "--root", cli.workdir);
          yield* cli.expectExitCode(0);

          yield* cli.run(
            "add",
            "--yes",
            "--root",
            root,
            "--target",
            "package/ai:package-ai-toolkit-math",
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("math-test", function* (project) {
            yield* project.writeFile(
              "packages/ai/math-smoke.ts",
              `import { Effect, Stream } from "effect";
import { MathToolkit, MathToolkitHandlers } from "./src/toolkits/MathToolkit";

const cases = [
  ["-2 ^ 2", "-4"],
  ["(-2) ^ 2", "4"],
  ["2 ^ -2", "0.25"],
  ["2 ^ 3 ^ 2", "512"],
] as const;

await Effect.runPromise(
  Effect.forEach(cases, ([expression, expected]) =>
    Effect.gen(function* () {
      const toolkit = yield* MathToolkit;
      const stream = yield* toolkit.handle("calculate", { expression });
      const results = yield* Stream.runCollect(stream);
      const actual = results[0]?.result;
      if (actual !== expected) {
        return yield* Effect.dieMessage(
          expression + ": expected " + expected + ", got " + actual,
        );
      }
    }),
  ).pipe(Effect.provide(MathToolkitHandlers)),
);
`,
            );
            yield* project.expectCommandSucceeds(
              "Math toolkit smoke test",
              "bun",
              "packages/ai/math-smoke.ts",
            );
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
              '"effect-boxes": "^0.18.1"',
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
            yield* project.expectFileContaining(
              "apps/client-foldkit-app/vite.config.ts",
              'fileURLToPath(new URL("./src", import.meta.url))',
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
