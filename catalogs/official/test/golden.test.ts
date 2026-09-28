import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
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
