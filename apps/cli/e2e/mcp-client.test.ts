import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { CLI } from "./harness";

const readFixture = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(
      new URL(`./fixtures/${name}`, import.meta.url).pathname,
    );
  }).pipe(Effect.provide(NodeServices.layer));

describe("MCP chat extensions", () => {
  layer(CLI.layer)("generated server and CLI", (it) => {
    it.effect(
      "adds the MCP Client parent without adding capability implementations",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const created = yield* cli.run(
            "create",
            "mcp-client-only",
            "--root",
            cli.workdir,
            "--target",
            "cli/app:cli-command-chat-ask,cli-chat-mcp",
            "--target",
            "server/api:server-chat-mcp",
            "--yes",
            "--no-git",
          );
          assert.strictEqual(
            created.exitCode,
            0,
            created.stdout + created.stderr,
          );
          yield* cli.withinProject("mcp-client-only", function* (project) {
            for (const app of ["cli-app", "server-api"]) {
              const mcp = `apps/${app}/src/mcp`;
              yield* project.expectFileExists(`${mcp}/McpClient.ts`);
              yield* project.expectFileContaining(
                `${mcp}/McpClient.ts`,
                `name: "${app}"`,
              );
              yield* project.expectFileNotContaining(
                `${mcp}/McpClient.ts`,
                /makeMcp(Tools|Resources|Prompts)/,
              );
              for (const capability of ["Tools", "Resources", "Prompts"]) {
                yield* project.expectFileNotExists(
                  `${mcp}/Mcp${capability}.ts`,
                );
              }
            }
            yield* project.expectTypeCheckPasses();
          });
        }),
      { timeout: 120_000 },
    );

    for (const capability of ["tools", "resources", "prompts"]) {
      it.effect(
        `runs ${capability} alone in both apps without unrelated MCP configuration`,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const projectName = `mcp-${capability}-only`;
            const created = yield* cli.run(
              "create",
              projectName,
              "--root",
              cli.workdir,
              "--target",
              `cli/app:cli-command-chat-ask,cli-chat-mcp-${capability}`,
              "--target",
              `server/api:server-chat-mcp-${capability}`,
              "--yes",
              "--no-git",
            );
            assert.strictEqual(
              created.exitCode,
              0,
              created.stdout + created.stderr,
            );
            const model = yield* readFixture("mcp-model.ts.txt");
            const scenarios = yield* readFixture("mcp-scenarios.ts.txt");
            const toolTypes = yield* readFixture("chat-toolkit-types.ts.txt");
            yield* cli.withinProject(projectName, function* (project) {
              for (const app of ["cli-app", "server-api"]) {
                const mcp = `apps/${app}/src/mcp`;
                for (const option of [
                  "tools",
                  "resources",
                  "prompts",
                ] as const) {
                  const name = {
                    tools: "McpTools",
                    resources: "McpResources",
                    prompts: "McpPrompts",
                  }[option];
                  if (option === capability)
                    yield* project.expectFileExists(`${mcp}/${name}.ts`);
                  else yield* project.expectFileNotExists(`${mcp}/${name}.ts`);
                  yield* project.expectFileNotContaining(
                    `${mcp}/McpClient.ts`,
                    `make${name}`,
                  );
                }
              }
              yield* project.writeFile(
                "packages/ai/src/workflow/ChatTurnExtensions.typecheck.ts",
                toolTypes,
              );
              yield* project.expectTypeCheckPasses();
              yield* project.writeFile(
                "packages/ai/src/LanguageModel.ts",
                model,
              );
              yield* project.writeFile(
                "apps/cli-app/mcp-scenarios.ts",
                scenarios,
              );
              const result = yield* project.exec(
                "bun",
                "apps/cli-app/mcp-scenarios.ts",
                capability,
              );
              assert.strictEqual(
                result.exitCode,
                0,
                result.stdout + result.stderr,
              );
              assert.include(
                result.stdout,
                `MCP isolated ${capability} passed`,
              );
            });
          }),
        { timeout: 120_000 },
      );
    }

    it.effect(
      "produces the same prompt composition when added incrementally and repeatedly",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const base = "cli-command-chat-ask,cli-command-chat-terminal";
          const feature = "cli-chat-mcp-prompts,cli-chat-mcp-resources";
          for (const [name, modules] of [
            ["mcp-incremental", base],
            ["mcp-fresh", `${base},${feature}`],
          ] as const) {
            const result = yield* cli.run(
              "create",
              name,
              "--root",
              cli.workdir,
              "--target",
              `cli/app:${modules}`,
              "--yes",
              "--no-git",
            );
            assert.strictEqual(
              result.exitCode,
              0,
              result.stdout + result.stderr,
            );
          }
          for (const _attempt of [1, 2]) {
            const result = yield* cli.run(
              "add",
              "--root",
              `${cli.workdir}/mcp-incremental`,
              "--target",
              `cli/app:${feature}`,
              "--yes",
            );
            assert.strictEqual(
              result.exitCode,
              0,
              result.stdout + result.stderr,
            );
          }
          const fs = yield* FileSystem.FileSystem;
          for (const path of [
            "apps/cli-app/src/commands/ask.ts",
            "apps/cli-app/src/commands/chat.ts",
            "apps/cli-app/src/chat/ChatDriver.ts",
            "packages/domain/src/ChatTurnOptions.ts",
          ]) {
            const [incremental, fresh] = yield* Effect.all([
              fs.readFileString(`${cli.workdir}/mcp-incremental/${path}`),
              fs.readFileString(`${cli.workdir}/mcp-fresh/${path}`),
            ]);
            assert.strictEqual(incremental, fresh, path);
          }
          yield* cli.withinProject("mcp-incremental", function* (project) {
            yield* project.expectTypeCheckPasses();
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      { timeout: 180_000 },
    );

    it.effect(
      "runs discovery-to-briefing across real MCP and API servers",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const created = yield* cli.run(
            "create",
            "mcp-paired-example",
            "--root",
            cli.workdir,
            "--target",
            "server-mcp/remote:mcp-prompt-briefing",
            "--target",
            "server/api:server-chat-mcp-tools,server-chat-mcp-resources,server-chat-mcp-prompts",
            "--yes",
            "--no-git",
          );
          assert.strictEqual(
            created.exitCode,
            0,
            created.stdout + created.stderr,
          );
          const model = (yield* readFixture("mcp-model.ts.txt"))
            .replaceAll('"mcp__double"', '"mcp__calculate"')
            .replace("params: { value: 21 }", 'params: { expression: "6 * 7" }')
            .replace(
              "requests.push(options);",
              'requests.push(options); console.log("PAIR_MODEL_REQUEST", JSON.stringify({ tools: options.tools.map((tool) => tool.name), messages: options.prompt.content }));',
            );
          const probe = yield* readFixture("mcp-pair.ts.txt");
          yield* cli.withinProject("mcp-paired-example", function* (project) {
            yield* project.expectTypeCheckPasses();
            yield* project.expectFileNotExists(
              "apps/server-api/src/examples/McpChat.ts",
            );
            yield* project.expectFileNotContaining(
              "apps/server-api/package.json",
              "example:mcp",
            );
            yield* project.expectFileExists(
              "apps/server-mcp-remote/src/prompts/BriefingPrompt.ts",
            );
            yield* project.expectFileExists(
              "apps/server-mcp-remote/src/resources/PrimerResource.ts",
            );
            yield* project.writeFile("packages/ai/src/LanguageModel.ts", model);
            yield* project.writeFile("apps/server-api/mcp-pair.ts", probe);
            const result = yield* project.exec(
              "bun",
              "apps/server-api/mcp-pair.ts",
            );
            assert.strictEqual(
              result.exitCode,
              0,
              result.stdout + result.stderr,
            );
            assert.include(result.stdout, "MCP paired example passed");
          });
        }),
      { timeout: 120_000 },
    );

    it.effect(
      "executes local and remote model-selected tools, prepares selected context, and owns connection cleanup",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;
          const created = yield* cli.run(
            "create",
            "mcp-chat-apps",
            "--root",
            cli.workdir,
            "--target",
            "cli/app:cli-command-chat-ask,cli-command-chat-terminal,cli-chat-mcp-tools,cli-chat-mcp-resources,cli-chat-mcp-prompts",
            "--target",
            "server/api:server-chat-mcp-tools,server-chat-mcp-resources,server-chat-mcp-prompts",
            "--target",
            "server/plain:server-chat-rpc",
            "--yes",
            "--no-git",
          );
          assert.strictEqual(
            created.exitCode,
            0,
            created.stdout + created.stderr,
          );
          const model = yield* readFixture("mcp-model.ts.txt");
          const scenarios = yield* readFixture("mcp-scenarios.ts.txt");
          yield* cli.withinProject("mcp-chat-apps", function* (project) {
            yield* project.expectFileNotExists("packages/mcp/package.json");
            yield* project.expectFileNotExists(
              "apps/cli-app/src/commands/mcpTools.ts",
            );
            const help = yield* project.exec(
              "bun",
              "apps/cli-app/src/index.ts",
              "--help",
            );
            assert.strictEqual(help.exitCode, 0, help.stderr);
            assert.include(help.stdout, "ask");
            assert.notInclude(help.stdout, "mcp-tools");
            // Replace only the generated external model provider. The app drivers,
            // chat service, agentic loop, MCP transport, and tools remain real.
            yield* project.writeFile("packages/ai/src/LanguageModel.ts", model);
            yield* project.writeFile(
              "apps/cli-app/mcp-scenarios.ts",
              scenarios,
            );
            const result = yield* project.exec(
              "bun",
              "apps/cli-app/mcp-scenarios.ts",
            );
            assert.strictEqual(
              result.exitCode,
              0,
              result.stdout + result.stderr,
            );
            assert.include(result.stdout, "MCP chat integration passed");
          });
        }),
      { timeout: 120_000 },
    );
  });
});
