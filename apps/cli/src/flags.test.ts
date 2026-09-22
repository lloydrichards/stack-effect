import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { TestConsole } from "effect/testing";
import { CliOutput, Command } from "effect/unstable/cli";
import {
  dryRunFlag,
  noGitFlag,
  showFilesFlag,
  trustFlag,
  validateShowFiles,
  yesFlag,
} from "./flags";

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

describe("optional command switches", () => {
  it.effect(
    "runs with omitted switches disabled and enables explicit switches",
    () =>
      Effect.gen(function* () {
        const received = yield* Ref.make<
          ReadonlyArray<{
            readonly dryRun: boolean;
            readonly showFiles: boolean;
            readonly yes: boolean;
            readonly noGit: boolean;
            readonly trust: boolean;
          }>
        >([]);
        const command = Command.make(
          "scaffold",
          {
            dryRun: dryRunFlag,
            showFiles: showFilesFlag,
            yes: yesFlag,
            noGit: noGitFlag,
            trust: trustFlag,
          },
          (flags) => Ref.update(received, (values) => [...values, flags]),
        );
        const run = Command.runWith(command, { version: "test" });
        yield* run([]);
        yield* run([
          "--dry-run",
          "--show-files",
          "--yes",
          "--no-git",
          "--trust",
        ]);
        expect(yield* Ref.get(received)).toEqual([
          {
            dryRun: false,
            showFiles: false,
            yes: false,
            noGit: false,
            trust: false,
          },
          {
            dryRun: true,
            showFiles: true,
            yes: true,
            noGit: true,
            trust: true,
          },
        ]);
      }).pipe(Effect.provide(helpLayer)),
  );
});
