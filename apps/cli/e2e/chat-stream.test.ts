import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { labsCatalogArgs } from "./fixtures/labs-source";
import { CLI } from "./harness";

layer(CLI.layer)("generated AI chat", (it) => {
  it.effect(
    "should report the round limit in ask and Foldkit when a model keeps calling tools",
    () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const created = yield* cli.run(
          "create",
          "chat-stream",
          ...labsCatalogArgs,
          "--root",
          cli.workdir,
          "--target",
          "package/ai:package-ai-chat-service,package-ai-toolkit-memory,package-ai-toolkit-plan,package-ai-chat-toolkit-datetime,package-ai-toolkit-webfetch",
          "--target",
          "server/api:server-chat-runtime-managed",
          "--target",
          "cli/app:cli-command-chat-ask",
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
        const [
          stream,
          limitModel,
          sessionModel,
          sessions,
          watchReplay,
          ownerScope,
        ] = yield* Effect.all([
          fixture("chat-stream"),
          fixture("step-limit-model"),
          fixture("chat-session-model"),
          fixture("chat-sessions"),
          fixture("chat-watch-replay"),
          fixture("chat-owner-scope"),
        ]);
        yield* cli.withinProject("chat-stream", function* (project) {
          yield* project.expectTypeCheckPasses();
          const modelPath = "packages/ai/src/LanguageModel.ts";
          yield* project.writeFile(modelPath, limitModel);
          const path = "chat-stream.scenarios.ts";
          yield* project.writeFile(path, stream);
          yield* project.expectCommandSucceeds(
            "chat stream scenarios",
            "bun",
            path,
          );
          const ask = yield* project.exec(
            "bun",
            "apps/cli-app/src/index.ts",
            "ask",
            "continue",
          );
          assert.strictEqual(ask.exitCode, 1, ask.stdout + ask.stderr);
          assert.include(
            ask.stderr,
            "Chat reached its model round limit.",
            ask.stdout + ask.stderr,
          );

          yield* project.writeFile(modelPath, sessionModel);
          yield* project.writeFile("chat-watch-replay.ts", watchReplay);
          yield* project.expectCommandSucceeds(
            "managed chat watch replay",
            "bun",
            "chat-watch-replay.ts",
          );
          yield* project.writeFile("chat-owner-scope.ts", ownerScope);
          yield* project.expectCommandSucceeds(
            "managed chat owner scope cleanup",
            "bun",
            "chat-owner-scope.ts",
          );
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
