import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { labsCatalogArgs } from "./fixtures/labs-source";
import { CLI } from "./harness";

layer(CLI.layer)("generated Slack integration", (it) => {
  it.effect(
    "adds the shared bot to a named server and routes a signed mention",
    () =>
      Effect.gen(function* () {
        const cli = yield* CLI;
        const created = yield* cli.run(
          "create",
          "slack-bot",
          ...labsCatalogArgs,
          "--root",
          cli.workdir,
          "--target",
          "server/support:server-slack-bot",
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
          new URL("./fixtures/slack-mention.ts.txt", import.meta.url).pathname,
        );
        yield* cli.withinProject("slack-bot", function* (project) {
          const server = "apps/support";
          const bot = "packages/chat-bot/src/Bot.ts";
          yield* project.expectTypeCheckPasses();
          yield* project.expectBuildSucceeds();
          yield* project.expectFileContaining(
            `${server}/slack-app.yml`,
            "app_mention",
          );
          yield* project.expectFileContaining(
            `${server}/.env.slack.example`,
            "SLACK_SIGNING_SECRET",
          );
          yield* project.expectFileNotExists("apps/server-api/package.json");
          yield* project.expectFileNotContaining(
            `${server}/package.json`,
            "fixture:slack",
          );
          yield* project.expectFileNotExists(
            `${server}/src/fixtures/slack-mention.ts`,
          );
          const scenario = `${server}/slack.scenario.ts`;
          yield* project.writeFile(scenario, fixture);
          yield* project.expectCommandSucceeds(
            "signed Slack mention",
            "bun",
            scenario,
          );

          const botSource = yield* fs
            .readFileString(`${project.dir}/${bot}`)
            .pipe(Effect.orDie);
          yield* project.writeFile(bot, botSource.replace('"pong"', '"hello"'));
          yield* project.expectCommandSucceeds(
            "edited bot reply",
            "bun",
            scenario,
            "hello",
          );
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 120_000 },
  );
});
