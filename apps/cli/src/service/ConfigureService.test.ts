import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { STACK_CONFIG_SCHEMA_URL, StackConfig } from "@repo/domain/Scaffold";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { CONFIG_FILENAME, ConfigureService } from "./ConfigureService";

const testLayer = ConfigureService.layer.pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.effect(
  "should round-trip $schema without adding it to configs that lack it when the config is rewritten",
  () =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-config-roundtrip-",
      });
      const location = path.join(directory, CONFIG_FILENAME);
      yield* fs.writeFileString(
        location,
        '{"name":"old","runtime":{"_tag":"bun"}}',
      );
      const old = yield* configure.readConfig(directory);
      assert.isUndefined(old.$schema);
      yield* configure.writeConfig(directory, old);
      const oldJson = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
      )(yield* fs.readFileString(location));
      assert.isUndefined(oldJson["$schema"]);

      const annotated = new StackConfig({
        name: old.name,
        runtime: old.runtime,
        $schema: STACK_CONFIG_SCHEMA_URL,
      });
      yield* configure.writeConfig(directory, annotated);
      assert.strictEqual(
        (yield* configure.readConfig(directory)).$schema,
        STACK_CONFIG_SCHEMA_URL,
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);
