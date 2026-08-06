import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestConsole } from "effect/testing";
import { CliOutput, Command } from "effect/unstable/cli";
import { showFilesFlag, validateShowFiles } from "./flags";

const helpLayer = Layer.mergeAll(
  NodeServices.layer,
  TestConsole.layer,
  CliOutput.layer(CliOutput.defaultFormatter({ colors: false })),
);

describe("show-files flag", () => {
  it.effect("documents the shared dry-run companion", () =>
    Effect.gen(function* () {
      const command = Command.make("scaffold", { showFiles: showFilesFlag });
      yield* Command.runWith(command, { version: "test" })(["--help"]);
      const output = (yield* TestConsole.logLines).join("\n");

      expect(output).toContain("--show-files");
      expect(output).toContain(
        "Include generated file contents in a dry-run preview",
      );
    }).pipe(Effect.provide(helpLayer)),
  );

  it.effect("rejects show-files without dry-run", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateShowFiles({ dryRun: false, showFiles: true }),
      );

      expect(error).toBe("--show-files requires --dry-run.");
    }),
  );

  it.effect("accepts show-files with dry-run", () =>
    validateShowFiles({ dryRun: true, showFiles: true }),
  );
});
