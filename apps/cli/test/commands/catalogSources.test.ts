import { assert, describe, it } from "@effect/vitest";
import { OFFICIAL_CATALOG_URL } from "@repo/domain/CatalogSource";
import { Effect, Schema } from "effect";
import {
  catalogSourcesFixture,
  errorMessage,
  parseRenderedCreateCommand,
  urls,
  withNodeServices,
} from "../fixtures/catalogSources";

const createAcme = (
  project: string,
  directory: string,
  extra: string[] = [],
) => [
  "create",
  project,
  "--catalog",
  `acme=${urls.acme}`,
  "--target",
  "api/svc:acme-api-rest",
  "--yes",
  ...extra,
  "--root",
  directory,
];

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

/** Rendered terminal text without ANSI colours, box borders, or line wraps. */
const plainText = (lines: ReadonlyArray<string>) =>
  lines
    .join("\n")
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
    .replace(/[│╭╮╰╯─]/g, " ")
    .replace(/\s+/g, " ");

// Checks the catalog source selection contract in .okf/domain/catalog-sources.md
// across create, add, plan and graph.
describe("catalog sources", () => {
  describe("selection", () => {
    it.effect(
      "should omit the catalogs field and request only the official catalog when created without --catalog",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { run, directory, readConfig } = yield* catalogSourcesFixture;
            const { requested } = yield* run([
              "create",
              "plain",
              "--target",
              "package/domain:domain-api-contracts",
              "--yes",
              "--no-git",
              "--root",
              directory,
            ]);
            const config = yield* readConfig("plain");
            assert.notProperty(config, "catalogs");
            assert.strictEqual(config["lint"], "oxlint");
            assert.deepStrictEqual(requested, [OFFICIAL_CATALOG_URL]);
          }),
        ),
      30_000,
    );

    it.effect(
      "should save only custom sources and omit official defaults when created with --catalog",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { run, directory, path, fs, readConfig } =
              yield* catalogSourcesFixture;
            const { requested } = yield* run(createAcme("solo", directory));
            const config = yield* readConfig("solo");
            assert.deepStrictEqual(config["catalogs"], [
              { name: "acme", url: urls.acme },
            ]);
            assert.deepStrictEqual(
              ["lint", "format", "test", "monorepo"].filter(
                (field) => field in config,
              ),
              [],
            );
            assert.isTrue(
              yield* fs.exists(path.join(directory, "solo", "ACME.md")),
            );
            assert.notInclude(requested, OFFICIAL_CATALOG_URL);
          }),
        ),
    );

    it.effect(
      "should skip custom scripts when --yes is given without --trust",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { run, directory } = yield* catalogSourcesFixture;
            const { executed } = yield* run(createAcme("untrusted", directory));
            const commands = executed.map(({ command }) => command);
            assert.isTrue(
              commands.some((command) => command.includes("install")),
            );
            assert.notInclude(commands, "acme generate");
          }),
        ),
    );

    it.effect("should run custom scripts when --trust is given", () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory } = yield* catalogSourcesFixture;
          const { executed } = yield* run(
            createAcme("trusted", directory, ["--trust"]),
          );
          assert.include(
            executed.map(({ command }) => command),
            "acme generate",
          );
        }),
      ),
    );

    it.effect(
      "should reuse and keep saved sources when add has no --catalog",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { run, directory, path, readConfig } =
              yield* catalogSourcesFixture;
            yield* run(createAcme("solo", directory));
            const { requested } = yield* run([
              "add",
              "--root",
              path.join(directory, "solo"),
              "--target",
              "api/other:acme-api-rest",
              "--yes",
            ]);
            assert.deepStrictEqual(requested, [urls.acme]);
            assert.deepStrictEqual((yield* readConfig("solo"))["catalogs"], [
              { name: "acme", url: urls.acme },
            ]);
          }),
        ),
    );

    it.effect(
      "should fail with a mismatch CatalogSelectionError when --catalog differs from the saved sources",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { run, runFailing, directory, path } =
              yield* catalogSourcesFixture;
            yield* run(createAcme("solo", directory));
            const { error, requested } = yield* runFailing([
              "add",
              "--root",
              path.join(directory, "solo"),
              "--catalog",
              "official",
              "--target",
              "api/other:acme-api-rest",
              "--yes",
              "--dry-run",
            ]);
            assert.propertyVal(error, "_tag", "CatalogSelectionError");
            assert.propertyVal(error, "reason", "mismatch");
            assert.include(
              errorMessage(error),
              "stack.effect.json saves acme=",
            );
            assert.deepStrictEqual(requested, []);
          }),
        ),
      30_000,
    );

    it.effect(
      "should compose a custom module with the official catalog when the custom catalog requires it",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { run, directory } = yield* catalogSourcesFixture;
            const { requested, stdout } = yield* run([
              "create",
              "mixed",
              "--catalog",
              "official",
              "--catalog",
              `ext=${urls.ext}`,
              "--target",
              "package/domain:ext-audit",
              "--yes",
              "--no-git",
              "--dry-run",
              "--root",
              directory,
            ]);
            assert.sameMembers(
              [...requested],
              [OFFICIAL_CATALOG_URL, urls.ext],
            );
            assert.include(stdout.join("\n"), "ext-audit.txt");
          }),
        ),
    );

    it.effect(
      "should stop before writing when a selected source is unavailable",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { runFailing, directory, path, fs } =
              yield* catalogSourcesFixture;
            const { error } = yield* runFailing([
              "create",
              "broken",
              "--catalog",
              `acme=${urls.acme}`,
              "--catalog",
              `down=${urls.down}`,
              "--target",
              "api/svc:acme-api-rest",
              "--yes",
              "--root",
              directory,
            ]);
            assert.include(errorMessage(error), "Catalog source down");
            assert.isFalse(yield* fs.exists(path.join(directory, "broken")));
          }),
        ),
    );

    it.effect(
      "should reject the selection before any request when official is given a URL",
      () =>
        withNodeServices(
          Effect.gen(function* () {
            const { runFailing, directory } = yield* catalogSourcesFixture;
            const { error, requested } = yield* runFailing([
              "create",
              "reserved",
              "--catalog",
              "official=https://mirror.test/v1.json",
              "--target",
              "package/domain:domain-api-contracts",
              "--yes",
              "--root",
              directory,
            ]);
            assert.include(errorMessage(error), "Invalid --catalog selection");
            assert.deepStrictEqual(requested, []);
          }),
        ),
    );
  });

  describe("selection contract", () => {
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
            const { createCommand } = yield* decodePlanOutput(
              stdout.join("\n"),
            );
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

  describe("edge cases", () => {
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
            assert.include(
              saved.stdout.join("\n"),
              "acme-api-rest #40;acme#41;",
            );
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
            assert.isFalse(
              yield* fs.exists(path.join(directory, "noworkspace")),
            );
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
});
