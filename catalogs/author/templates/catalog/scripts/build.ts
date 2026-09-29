import { buildCatalog } from "@stack-effect/author";
import { Console, Effect, FileSystem, Path } from "effect";
import { catalog, catalogId, root } from "../catalog/index.ts";
import { runMain, Services } from "./platform.ts";

// Upload `dist` as is; consumers select <host>/registry/v1/catalog.json.
const output = new URL("../dist/registry/v1/catalog.json", import.meta.url);

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { json } = yield* buildCatalog(catalog, { catalogId, root });
  const destination = yield* path.fromFileUrl(output);
  yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
  yield* fs.writeFileString(destination, json);
  yield* Console.log(`Wrote ${path.relative(process.cwd(), destination)}`);
});

runMain(
  program.pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(Services),
  ),
  { disableErrorReporting: true },
);
