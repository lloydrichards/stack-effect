import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { CLI } from "./harness";

layer(CLI.layer)("generated AI chat", (it) => {
  it.effect(
    "streams tool results once and reports how each generation ended",
    () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const created = yield* cli.run(
          "create",
          "chat-stream",
          "--root",
          cli.workdir,
          "--target",
          "package/ai:package-ai-chat-service",
          "--yes",
          "--no-git",
        );
        assert.strictEqual(
          created.exitCode,
          0,
          created.stdout + created.stderr,
        );
        const fs = yield* FileSystem.FileSystem;
        const fixture = yield* fs.readFileString(
          new URL("./fixtures/chat-stream.ts.txt", import.meta.url).pathname,
        );
        yield* cli.withinProject("chat-stream", function* (project) {
          yield* project.expectTypeCheckPasses();
          const path = "chat-stream.scenarios.ts";
          yield* project.writeFile(path, fixture);
          yield* project.expectCommandSucceeds(
            "chat stream scenarios",
            "bun",
            path,
          );
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 120_000 },
  );
});
