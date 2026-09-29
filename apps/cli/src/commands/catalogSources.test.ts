import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { OFFICIAL_CATALOG_URL } from "../service/CatalogProvider";
import {
  catalogSourcesFixture,
  errorMessage,
  urls,
  withNodeServices,
} from "./catalogSources.fixture";

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

describe("catalog source selection", () => {
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
          assert.include(errorMessage(error), "stack.effect.json saves acme=");
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
          assert.sameMembers([...requested], [OFFICIAL_CATALOG_URL, urls.ext]);
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
