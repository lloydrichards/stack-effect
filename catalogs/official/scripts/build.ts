import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { exportOfficialCatalog, publishedCatalogUrl } from "../src/service";

await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const destination = yield* path.fromFileUrl(publishedCatalogUrl);
    yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
    yield* fs.writeFileString(destination, yield* exportOfficialCatalog);
    yield* Effect.log(`Wrote ${path.relative(process.cwd(), destination)}`);
  }).pipe(Effect.provide(NodeServices.layer)),
);
