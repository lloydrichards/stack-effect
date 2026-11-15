import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { CLI } from "./harness";

layer(CLI.layer)("generated AI chat", (it) => {
  it.effect(
    "streams tool results and keeps stateful tools scoped to each chat",
    () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const created = yield* cli.run(
          "create",
          "chat-stream",
          "--root",
          cli.workdir,
          "--target",
          "package/ai:package-ai-chat-service,package-ai-toolkit-memory,package-ai-toolkit-plan,package-ai-chat-toolkit-datetime",
          "--target",
          "server/api:server-chat-runtime-managed",
          "--target",
          "client-foldkit/app:client-foldkit-chat",
          "--yes",
          "--no-git",
        );
        assert.strictEqual(
          created.exitCode,
          0,
          created.stdout + created.stderr,
        );
        const fs = yield* FileSystem.FileSystem;
        const fixture = (name: string) =>
          fs.readFileString(
            new URL(`./fixtures/${name}.ts.txt`, import.meta.url).pathname,
          );
        const [stream, model, sessions] = yield* Effect.all([
          fixture("chat-stream"),
          fixture("chat-session-model"),
          fixture("chat-sessions"),
        ]);
        yield* cli.withinProject("chat-stream", function* (project) {
          yield* project.expectTypeCheckPasses();
          const path = "chat-stream.scenarios.ts";
          yield* project.writeFile(path, stream);
          yield* project.expectCommandSucceeds(
            "chat stream scenarios",
            "bun",
            path,
          );
          yield* project.writeFile("packages/ai/src/LanguageModel.ts", model);
          yield* project.writeFile("chat-sessions.ts", sessions);
          yield* project.expectCommandSucceeds(
            "RPC chat sessions",
            "bun",
            "chat-sessions.ts",
          );
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 120_000 },
  );
});
