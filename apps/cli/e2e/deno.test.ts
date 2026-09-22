import { describe, expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { CLI } from "./harness";

describe("Deno generated project", () => {
  layer(CLI.layer)("create", (it) => {
    it.effect("should plan a Deno SQLite package", () =>
      Effect.gen(function* () {
        const cli = yield* CLI;

        yield* cli.run(
          "create",
          "deno-sqlite",
          "--yes",
          "--no-git",
          "--dry-run",
          "--runtime",
          "deno",
          "--target",
          "package/db:package-db-sqlite",
          "--root",
          cli.workdir,
        );

        yield* cli.expectExitCode(0);
        yield* cli.expectFileNotExists("deno-sqlite/stack.effect.json");
        yield* cli.expectFileNotExists("deno-sqlite/package.json");
      }),
    );

    it.effect(
      "should install Git hooks after initializing the repository",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "deno-hooks",
            "--yes",
            "--trust",
            "--runtime",
            "deno",
            "--target",
            "workspace/deno-hooks:workspace-devenv-husky",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("deno-hooks", function* (project) {
            const hooksPath = yield* project.exec(
              "git",
              "config",
              "--get",
              "core.hooksPath",
            );
            expect(hooksPath.exitCode).toBe(0);
            expect(hooksPath.stdout.trim()).toBe(".husky/_");
          });
        }),
      { timeout: 120_000 },
    );

    it.effect(
      "should install, check, test, build, run CLI, and serve HTTP",
      () =>
        Effect.gen(function* () {
          const cli = yield* CLI;

          yield* cli.run(
            "create",
            "deno-app",
            "--yes",
            "--trust",
            "--runtime",
            "deno",
            "--target",
            "server/api:server-http-api,server-http-api-todos",
            "--target",
            "package/db:package-db-sqlite",
            "--target",
            "server-mcp/mcp:mcp-tools",
            "--target",
            "cli/app:cli-command-hello",
            "--root",
            cli.workdir,
          );
          yield* cli.expectExitCode(0);

          yield* cli.withinProject("deno-app", function* (project) {
            yield* project.expectFileExists(".git/HEAD");
            yield* project.expectFileContaining("deno.json", '"dev:all":');
            yield* project.expectFileContaining(
              "apps/server-api/src/index.ts",
              'from "@effect/platform-deno"',
            );
            yield* project.expectFileContaining(
              "apps/server-mcp-mcp/src/index.ts",
              'from "@effect/platform-deno"',
            );
            yield* project.expectFileContaining(
              "apps/cli-app/src/index.ts",
              'from "@effect/platform-deno"',
            );
            yield* project.expectCommandSucceeds(
              "Type-check",
              "deno",
              "task",
              "type-check:all",
            );
            yield* project.expectCommandSucceeds(
              "Tests",
              "deno",
              "task",
              "test:all",
            );
            yield* project.expectCommandSucceeds(
              "Build",
              "deno",
              "task",
              "build:all",
            );

            const hello = yield* project.exec(
              "apps/cli-app/dist/cli-app",
              "hello",
              "Codex",
            );
            expect(hello.exitCode).toBe(0);
            expect(hello.stdout).toContain("Hello, Codex!");

            yield* project.writeFile(
              "smoke-server.sh",
              `#!/bin/sh
set -eu
PORT=$((20000 + $$ % 20000))
HOST=127.0.0.1 PORT="$PORT" DATABASE_FILE=./data/app.sqlite apps/server-api/dist/server-api >server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40; do
  if curl -fsS "http://127.0.0.1:$PORT/" >server-response.txt 2>/dev/null; then
    grep -q '"Hello Effect!"' server-response.txt
    curl -fsS "http://127.0.0.1:$PORT/todos" -H 'Content-Type: application/json' --data '{"title":"Deno task"}' >todo-created.json
    grep -q '"title":"Deno task"' todo-created.json
    curl -fsS "http://127.0.0.1:$PORT/todos" >todo-list.json
    grep -q '"title":"Deno task"' todo-list.json
    exit 0
  fi
  sleep 0.25
done
cat server.log
exit 1
`,
            );
            yield* project.expectCommandSucceeds(
              "HTTP and shutdown",
              "sh",
              "smoke-server.sh",
            );

            yield* project.writeFile(
              "smoke-mcp.sh",
              `#!/bin/sh
set -eu
PORT=$((40000 + $$ % 20000))
MCP_HOST=127.0.0.1 MCP_PORT="$PORT" apps/server-mcp-mcp/dist/server-mcp-mcp >mcp.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40; do
  if curl -fsS "http://127.0.0.1:$PORT/mcp" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' >mcp-response.txt 2>/dev/null; then
    grep -q '"protocolVersion":"2025-06-18"' mcp-response.txt
    exit 0
  fi
  sleep 0.25
done
cat mcp.log
exit 1
`,
            );
            yield* project.expectCommandSucceeds(
              "MCP initialization and shutdown",
              "sh",
              "smoke-mcp.sh",
            );
          });
        }),
      { timeout: 300_000 },
    );
  });
});
