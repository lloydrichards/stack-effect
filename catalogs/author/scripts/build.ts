import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { exportAuthorCatalog, publishedAuthorCatalogUrl } from "../src/service";

await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const destination = yield* path.fromFileUrl(publishedAuthorCatalogUrl);
    yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
    yield* fs.writeFileString(destination, yield* exportAuthorCatalog);
    yield* Effect.log(`Wrote ${path.relative(process.cwd(), destination)}`);
  }).pipe(Effect.provide(NodeServices.layer)),
);
