import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  catalogSourcesFixture,
  parseRenderedCreateCommand,
  urls,
  withNodeServices,
} from "./catalogSources.fixture";

const decodePlanOutput = Schema.decodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      sources: Schema.Array(Schema.Struct({ name: Schema.String })),
      notes: Schema.Array(Schema.String),
      createCommand: Schema.String,
    }),
  ),
);

const acmeSelection = {
  targets: [
    {
      identity: { kind: "api", name: "svc" },
      modules: [{ id: "acme-api-rest" }],
    },
  ],
};

describe("catalog source selection contract", () => {
  it.effect(
    "should note --trust without adding it to createCommand when plan reads a custom catalog config",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory } = yield* catalogSourcesFixture;
          const { stdout } = yield* run(
            ["plan", "-f", "raw", "--root", directory],
            {
              stdin: {
                selection: acmeSelection,
                config: {
                  name: "solo",
                  runtime: { _tag: "bun" },
                  catalogs: [{ name: "acme", url: urls.acme }],
                },
              },
            },
          );
          const out = yield* decodePlanOutput(stdout.join("\n"));
          assert.deepStrictEqual(
            out.sources.map((source) => source.name),
            ["acme"],
          );
          assert.include(out.createCommand, "--catalog 'acme=");
          assert.notInclude(out.createCommand, "--trust");
          assert.match(out.notes.join("\n"), /--trust/);
        }),
      ),
    30_000,
  );

  it.effect(
    "should reproduce the saved config when the plan createCommand is run elsewhere",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, readConfig, readConfigAt, fs, path } =
            yield* catalogSourcesFixture;
          yield* run([
            "create",
            "solo",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--root",
            directory,
          ]);
          const { stdout } = yield* run(
            ["plan", "-f", "raw", "--root", path.join(directory, "solo")],
            { stdin: { selection: acmeSelection } },
          );
          const { createCommand } = yield* decodePlanOutput(stdout.join("\n"));
          const other = path.join(directory, "second");
          yield* fs.makeDirectory(other);
          yield* run([
            ...parseRenderedCreateCommand(createCommand),
            "--yes",
            "--root",
            other,
          ]);
          assert.deepStrictEqual(
            yield* readConfigAt(path.join(other, "solo")),
            yield* readConfig("solo"),
          );
        }),
      ),
    60_000,
  );

  it.effect(
    "should keep saved sources when the stdin config lists none",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, path } = yield* catalogSourcesFixture;
          yield* run([
            "create",
            "solo",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--root",
            directory,
          ]);
          const { stdout } = yield* run(
            ["plan", "-f", "raw", "--root", path.join(directory, "solo")],
            {
              stdin: {
                selection: acmeSelection,
                config: { name: "solo", runtime: { _tag: "bun" } },
              },
            },
          );
          const out = yield* decodePlanOutput(stdout.join("\n"));
          assert.deepStrictEqual(
            out.sources.map((source) => source.name),
            ["acme"],
          );
        }),
      ),
    60_000,
  );
});
