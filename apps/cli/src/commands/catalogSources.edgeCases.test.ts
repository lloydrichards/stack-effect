import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { OFFICIAL_CATALOG_URL } from "../service/CatalogProvider";
import {
  catalogSourcesFixture,
  errorMessage,
  parseRenderedCreateCommand,
  urls,
  withNodeServices,
} from "./catalogSources.fixture";

// Edge cases in catalog selection: script identity, trust notes, flag parsing.

/** Rendered terminal text without ANSI colours, box borders, or line wraps. */
const plainText = (lines: ReadonlyArray<string>) =>
  lines
    .join("\n")
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
    .replace(/[│╭╮╰╯─]/g, " ")
    .replace(/\s+/g, " ");

describe("catalog source selection edge cases", () => {
  it.effect(
    "should run only the official install at the repo root when a custom script shares its command and --trust is absent",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, path } = yield* catalogSourcesFixture;
          const { executed } = yield* run([
            "create",
            "sneaky",
            "--catalog",
            `sneaky=${urls.sneaky}`,
            "--target",
            "api/svc:sneaky-api",
            "--yes",
            "--root",
            directory,
          ]);
          assert.deepStrictEqual(
            executed.filter(({ command }) => command === "bun install"),
            [{ command: "bun install", cwd: path.join(directory, "sneaky") }],
          );
        }),
      ),
    30_000,
  );

  it.effect(
    "should note that custom scripts need --trust when create renders a custom catalog",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory } = yield* catalogSourcesFixture;
          const { stdout } = yield* run([
            "create",
            "note",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--dry-run",
            "--root",
            directory,
          ]);
          const text = plainText(stdout);
          assert.include(text, "acme generate");
          assert.include(text, "--trust");
        }),
      ),
    30_000,
  );

  it.effect(
    "should label each graph node with its catalog source when sources are selected by flag or read from --root",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, path } = yield* catalogSourcesFixture;
          // NOTE: Mermaid escapes the parentheses around a node's source.
          const flagged = yield* run([
            "graph",
            "--format",
            "mermaid",
            "--catalog",
            `acme=${urls.acme}`,
            "--catalog",
            `beta=${urls.beta}`,
          ]);
          const flaggedText = flagged.stdout.join("\n");
          assert.include(flaggedText, "acme-api-rest #40;acme#41;");
          assert.include(flaggedText, "worker #40;beta#41;");

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
          const saved = yield* run([
            "graph",
            "--format",
            "mermaid",
            "--root",
            path.join(directory, "solo"),
          ]);
          assert.include(saved.stdout.join("\n"), "acme-api-rest #40;acme#41;");
        }),
      ),
    60_000,
  );

  it.effect(
    "should fail before writing when a custom-only create has no workspace target",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { runFailing, directory, path, fs } =
            yield* catalogSourcesFixture;
          const { error } = yield* runFailing([
            "create",
            "noworkspace",
            "--catalog",
            `beta=${urls.beta}`,
            "--target",
            "worker/jobs",
            "--yes",
            "--root",
            directory,
          ]);
          assert.include(errorMessage(error), "workspace");
          assert.isFalse(yield* fs.exists(path.join(directory, "noworkspace")));
        }),
      ),
  );

  it.effect(
    "should fail before writing when a custom-only create selects an official --lint tool",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { runFailing, directory, path, fs } =
            yield* catalogSourcesFixture;
          const { error } = yield* runFailing([
            "create",
            "lint",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--lint",
            "oxlint",
            "--yes",
            "--root",
            directory,
          ]);
          assert.include(errorMessage(error), "oxlint");
          assert.isFalse(yield* fs.exists(path.join(directory, "lint")));
        }),
      ),
  );

  it.effect(
    "should load only the official catalog when add passes --catalog official in a project without catalogs",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, path } = yield* catalogSourcesFixture;
          yield* run([
            "create",
            "plain",
            "--target",
            "package/domain:domain-api-contracts",
            "--yes",
            "--no-git",
            "--root",
            directory,
          ]);
          const { requested } = yield* run([
            "add",
            "--root",
            path.join(directory, "plain"),
            "--catalog",
            "official",
            "--target",
            "package/other",
            "--yes",
            "--dry-run",
          ]);
          assert.deepStrictEqual(requested, [OFFICIAL_CATALOG_URL]);
        }),
      ),
    30_000,
  );

  it.effect(
    "should keep the saved catalogs when add repeats the saved set in a different order",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, path, readConfig } =
            yield* catalogSourcesFixture;
          yield* run([
            "create",
            "pair",
            "--catalog",
            `acme=${urls.acme}`,
            "--catalog",
            `beta=${urls.beta}`,
            "--target",
            "worker/jobs",
            "--yes",
            "--root",
            directory,
          ]);
          yield* run([
            "add",
            "--root",
            path.join(directory, "pair"),
            "--catalog",
            `beta=${urls.beta}`,
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
          ]);
          const config = yield* readConfig("pair");
          assert.deepStrictEqual(config["catalogs"], [
            { name: "acme", url: urls.acme },
            { name: "beta", url: urls.beta },
          ]);
        }),
      ),
  );

  it.effect(
    "should reproduce the saved config when the printed Create command is run elsewhere",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, readConfig, readConfigAt, fs, path } =
            yield* catalogSourcesFixture;
          const { stdout } = yield* run([
            "create",
            "orig",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--typescript",
            "6",
            "--no-git",
            "--yes",
            "--root",
            directory,
          ]);
          const line = stdout.find((entry) =>
            entry.startsWith("Create command:"),
          );
          assert.isDefined(line);
          const other = path.join(directory, "second");
          yield* fs.makeDirectory(other);
          yield* run([
            ...parseRenderedCreateCommand(line ?? ""),
            "--yes",
            "--root",
            other,
          ]);
          assert.deepStrictEqual(
            yield* readConfigAt(path.join(other, "orig")),
            yield* readConfig("orig"),
          );
        }),
      ),
  );

  it.effect(
    "should keep the full URL when the --catalog value contains '='",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, readConfig } = yield* catalogSourcesFixture;
          const { requested } = yield* run([
            "create",
            "query",
            "--catalog",
            `acme=${urls.acmeWithQuery}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--root",
            directory,
          ]);
          assert.deepStrictEqual(requested, [urls.acmeWithQuery]);
          assert.deepStrictEqual((yield* readConfig("query"))["catalogs"], [
            { name: "acme", url: urls.acmeWithQuery },
          ]);
        }),
      ),
  );

  it.effect.each(["=https://x.test/a.json", "official=", "acme="])(
    "should reject --catalog when name or URL is empty (%s)",
    (value) =>
      withNodeServices(
        Effect.gen(function* () {
          const { runFailing, directory } = yield* catalogSourcesFixture;
          const { error, requested } = yield* runFailing([
            "create",
            "bad",
            "--catalog",
            value,
            "--target",
            "worker/jobs",
            "--yes",
            "--root",
            directory,
          ]);
          assert.include(errorMessage(error), "Invalid --catalog");
          assert.deepStrictEqual(requested, []);
        }),
      ),
  );
});
