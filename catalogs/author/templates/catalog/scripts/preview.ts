import { buildCatalog } from "@stack-effect/author";
import { Console, Data, Effect, FileSystem, Layer, Path, Stream } from "effect";
import { HttpServer, HttpServerResponse } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { catalog, catalogId, root } from "../catalog/index.ts";
import { LoopbackServer, runMain, Services } from "./platform.ts";

class PreviewError extends Data.TaggedError("PreviewError")<{
  readonly message: string;
}> {}

const usage =
  "Usage: preview <target>/<name>[:<module>,...] [...], for example `preview app/:app-greeting`";

const program = Effect.gen(function* () {
  // pnpm forwards the `--` separator to the script, so drop it.
  const targets = process.argv.slice(2).filter((arg) => arg !== "--");
  if (targets.length === 0) return yield* new PreviewError({ message: usage });

  const { json } = yield* buildCatalog(catalog, { catalogId, root });
  yield* HttpServer.serveEffect(
    Effect.succeed(
      HttpServerResponse.text(json, { contentType: "application/json" }),
    ),
  );
  const url = yield* HttpServer.addressFormattedWith((address) =>
    Effect.succeed(`${address}/registry/v1/catalog.json`),
  );

  // A fresh project root and catalog cache, so no saved state is reused.
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scratch = yield* fs.makeTempDirectoryScoped({
    prefix: "catalog-preview-",
  });
  const spawner = yield* ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make(
      "stack-effect",
      [
        "create",
        "preview",
        `--root=${scratch}`,
        `--catalog=preview=${url}`,
        ...targets.map((target) => `--target=${target}`),
        "--yes",
        "--dry-run",
        "--show-files",
      ],
      {
        env: { XDG_CACHE_HOME: path.join(scratch, "cache") },
        extendEnv: true,
        stdout: "inherit",
        stderr: "pipe",
      },
    ),
  );
  const [usedCache, exitCode] = yield* Effect.all(
    [
      handle.stderr.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.tap((line) => Console.error(line)),
        Stream.runFold(
          () => false,
          (seen, line) => seen || line.includes("using cached data"),
        ),
      ),
      handle.exitCode,
    ],
    { concurrency: "unbounded" },
  );
  if (usedCache)
    return yield* new PreviewError({
      message: "The preview used a cached catalog instead of this build",
    });
  if (exitCode !== 0)
    return yield* new PreviewError({
      message: `stack-effect exited with code ${exitCode}`,
    });
});

runMain(
  program.pipe(
    Effect.scoped,
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(Layer.merge(LoopbackServer, Services)),
  ),
  { disableErrorReporting: true },
);
