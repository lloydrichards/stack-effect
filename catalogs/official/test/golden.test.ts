import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { CatalogDocument, TargetIdentity } from "@repo/domain/Catalog";
import { Effect, FileSystem, Path, Schema } from "effect";
import { exportOfficialCatalog } from "../src/service";

it.effect("builds the published official catalog byte for byte", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const golden = yield* fs.readFileString(
      yield* path.fromFileUrl(
        new URL("./catalog.golden.json", import.meta.url),
      ),
    );
    assert.strictEqual(yield* exportOfficialCatalog, golden);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("decodes the published document losslessly with TargetIdentity", () =>
  Effect.gen(function* () {
    const json = yield* exportOfficialCatalog;
    const codec = Schema.fromJsonString(CatalogDocument);
    const document = yield* Schema.decodeEffect(codec)(json);
    assert.strictEqual(
      yield* Schema.encodeEffect(codec)(document),
      json.trim(),
    );
    const identities = document.modules.flatMap((module) => [
      ...module.dependencies.map((dependency) =>
        dependency._tag === "required-target"
          ? dependency.identity
          : dependency.target,
      ),
      ...module.supportedOn.flatMap((rule) =>
        rule._tag === "identity" ? [rule.identity] : [],
      ),
    ]);
    assert.isNotEmpty(identities);
    for (const identity of identities)
      assert.instanceOf(identity, TargetIdentity);
  }),
);
