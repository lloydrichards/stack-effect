import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { CatalogDocument } from "@repo/domain/Catalog";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import * as Stdio from "effect/Stdio";
import {
  captureConsole,
  cliLayer,
  countingClient,
  jsonResponse,
  runCommand,
  stdinLayer,
  unavailableResponse,
} from "../commands/catalogSources.fixture";
import { OFFICIAL_CATALOG_URL } from "./CatalogProvider";

const document = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
  formatVersion: 1,
  catalogId: Schema.NonEmptyString.make("fixture"),
  requiredCapabilities: [],
  targets: [],
  modules: [],
});

const serving = () => countingClient(() => jsonResponse(document));
const unavailable = () => countingClient(() => unavailableResponse());

it.effect(
  "should not request the registry when help or version is shown",
  () => {
    const { client, requested } = serving();
    return Effect.gen(function* () {
      yield* runCommand(["--help"]);
      yield* runCommand(["--version"]);
      assert.strictEqual(requested.length, 0);
    }).pipe(Effect.provide(cliLayer(client)));
  },
);

it.effect("should request the registry once when graph runs", () => {
  const { client, requested } = serving();
  return Effect.gen(function* () {
    yield* runCommand(["graph", "--format", "mermaid"]);
    assert.strictEqual(requested.length, 1);
  }).pipe(Effect.provide(cliLayer(client)));
});

it.effect(
  "should use the changed catalog content when the next generation command runs",
  () =>
    Effect.gen(function* () {
      const initial = yield* exportOfficialCatalog;
      const decoded = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(initial);
      const revised = yield* Schema.encodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )({
        ...decoded,
        targets: decoded.targets.map((target) => ({
          ...target,
          contributions:
            target.kind === "client-react"
              ? target.contributions.map((contribution) =>
                  contribution._tag === "file" &&
                  contribution.path === "{{targetPath}}/src/main.tsx"
                    ? {
                        ...contribution,
                        contents: `${contribution.contents}\n// Registry revision marker.\n`,
                      }
                    : contribution,
                )
              : target.contributions,
        })),
      });
      assert.notStrictEqual(revised, initial);
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-content-update-",
      });
      const { client, requested } = countingClient((_, attempt) =>
        jsonResponse(attempt === 1 ? initial : revised),
      );
      const output = captureConsole();
      const args = [
        "create",
        "demo",
        "--target",
        "client-react/web:client-react-http-api",
        "--yes",
        "--no-git",
        "--dry-run",
        "--show-files",
        "--root",
        directory,
      ];
      yield* Effect.gen(function* () {
        yield* runCommand(args);
        yield* runCommand(args);
      }).pipe(Effect.provide(Layer.merge(cliLayer(client), output.layer)));
      assert.strictEqual(requested.length, 2);
      assert.notInclude(output.stdout[0] ?? "", "Registry revision marker");
      assert.include(output.stdout[1] ?? "", "Registry revision marker");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect(
  "should stop init before writing when the registry is unavailable",
  () => {
    const { client, requested } = unavailable();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-init-failure-",
      });
      yield* Effect.flip(
        runCommand(["init", "demo", "--yes", "--root", directory]),
      );
      assert.strictEqual(requested.length, 1);
      assert.isFalse(yield* fs.exists(path.join(directory, "demo")));
    }).pipe(Effect.scoped, Effect.provide(cliLayer(client)));
  },
);

it.effect(
  "should keep JSON stdout parseable when a later command falls back to cached data",
  () => {
    const { client, requested } = countingClient((_, attempt) =>
      attempt === 1 ? jsonResponse(document) : unavailableResponse(),
    );
    const output = captureConsole();
    return Effect.gen(function* () {
      yield* runCommand(["schema"]);
      yield* runCommand(["schema"]);
      assert.strictEqual(requested.length, 2);
      assert.strictEqual(output.stdout.length, 2);
      assert.isObject(
        yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(
          output.stdout[1] ?? "",
        ),
      );
      assert.include(
        output.stderr.join("\n"),
        `catalog official (${OFFICIAL_CATALOG_URL}): using cached data`,
      );
    }).pipe(Effect.provide(Layer.merge(cliLayer(client), output.layer)));
  },
);

it.effect(
  "should report a malformed config before requesting the registry when add reads an existing project",
  () => {
    const { client, requested } = unavailable();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-config-",
      });
      yield* fs.writeFileString(path.join(directory, "stack.effect.json"), "{");
      const error = yield* Effect.flip(
        runCommand([
          "add",
          "--yes",
          "--root",
          directory,
          "--target",
          "package/demo:package-db-sqlite",
          "--dry-run",
        ]),
      );
      assert.propertyVal(error, "_tag", "MalformedConfigError");
      assert.strictEqual(requested.length, 0);
    }).pipe(Effect.scoped, Effect.provide(cliLayer(client)));
  },
);

it.effect(
  "should reject planning stdin before requesting the registry when it is not JSON",
  () => {
    const { client, requested } = unavailable();
    return Effect.gen(function* () {
      yield* Effect.flip(runCommand(["plan"]));
      assert.strictEqual(requested.length, 0);
    }).pipe(
      Effect.provide(
        Layer.merge(
          cliLayer(client),
          Stdio.layerTest({
            stdin: Stream.make(new TextEncoder().encode("{")),
          }),
        ),
      ),
    );
  },
);

it.effect(
  "should report missing planning configuration before requesting the registry when --root has no config",
  () => {
    const { client, requested } = unavailable();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-missing-config-",
      });
      const error = yield* Effect.flip(
        runCommand(["plan", "--root", directory]),
      );
      assert.include(String(error), "No config found");
      assert.strictEqual(requested.length, 0);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.merge(
          cliLayer(client),
          stdinLayer({ selection: { targets: [] } }),
        ),
      ),
    );
  },
);
