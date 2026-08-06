import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";
import * as MemoryFileSystem from "../MemoryFileSystem";

it.effect("provides an in-memory FileSystem service", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    yield* fileSystem.makeDirectory("/workspace");
    yield* fileSystem.writeFileString("/workspace/package.json", "{}");

    expect(yield* fileSystem.readFileString("/workspace/package.json")).toBe(
      "{}",
    );
    expect(yield* fileSystem.exists("/workspace/package.json")).toBe(true);
  }).pipe(Effect.provide(MemoryFileSystem.layer)),
);

it.effect("creates a fresh volume for each make invocation", () =>
  Effect.gen(function* () {
    const first = yield* MemoryFileSystem.make;
    const second = yield* MemoryFileSystem.make;

    yield* first.writeFileString("/only-in-first", "contents");

    expect(yield* first.exists("/only-in-first")).toBe(true);
    expect(yield* second.exists("/only-in-first")).toBe(false);
  }),
);

it.effect("can provide isolated layer instances", () => {
  const write = Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.writeFileString("/isolated", "contents");
    return yield* fileSystem.exists("/isolated");
  });
  const read = Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem.exists("/isolated");
  });

  return Effect.gen(function* () {
    expect(
      yield* write.pipe(Effect.provide(Layer.fresh(MemoryFileSystem.layer))),
    ).toBe(true);
    expect(
      yield* read.pipe(Effect.provide(Layer.fresh(MemoryFileSystem.layer))),
    ).toBe(false);
  });
});
