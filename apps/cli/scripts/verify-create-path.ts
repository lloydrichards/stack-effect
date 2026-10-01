// Proves the deployed create path with a freshly installed CLI: create a
// registry project from the hosted author catalog, build its standalone
// catalog, and select that catalog alone from a second clean project.
//
//   bun run --cwd apps/cli verify:create-path [author-url] [--cli <npm spec>]
//
// Defaults: the production author.json and stack-effect@latest.
// @effect-diagnostics nodeBuiltinImport:off

// oxlint-disable-next-line effecttsgo/node-builtin-import -- NodeHttpServer.layer requires the Node server factory.
import { createServer } from "node:http";
import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
import {
  Console,
  Data,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  Stream,
} from "effect";
import { HttpServer, HttpServerResponse } from "effect/http";
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const AUTHOR_CATALOG_URL =
  "https://stack-effect.lloydrichards.dev/registry/v1/author.json";

class CreatePathFailed extends Data.TaggedError("CreatePathFailed")<{
  readonly message: string;
}> {}

const Config = Schema.fromJsonString(
  Schema.Struct({
    catalogs: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        url: Schema.optional(Schema.String),
      }),
    ),
  }),
);

const describe = (
  catalogs: ReadonlyArray<{
    readonly name: string;
    readonly url?: string | undefined;
  }>,
) =>
  catalogs.map(({ name, url }) => (url ? `${name}=${url}` : name)).join(", ");

const args = process.argv.slice(2);
const cliAt = args.indexOf("--cli");
const cliSpec = cliAt === -1 ? "stack-effect@latest" : (args[cliAt + 1] ?? "");
const authorUrl =
  args.find(
    (arg, index) =>
      !arg.startsWith("--") && (cliAt === -1 || index !== cliAt + 1),
  ) ?? AUTHOR_CATALOG_URL;

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;
  const root = yield* fs.makeTempDirectoryScoped({
    prefix: "stack-effect-create-path-",
  });
  const cli = path.join(root, "cli/node_modules/.bin/stack-effect");
  // A fresh catalog cache, so every source is fetched from its host.
  const env = { XDG_CACHE_HOME: path.join(root, "cache") };

  // Arguments go to the process as argv, never through a shell, so a
  // supplied npm spec or URL stays one literal argument.
  const step = (
    label: string,
    cwd: string,
    command: string,
    ...commandArgs: Array<string>
  ) =>
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, commandArgs, {
          cwd,
          env,
          extendEnv: true,
          stdout: "pipe",
          stderr: "pipe",
        }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      return exitCode === 0
        ? yield* Console.log(`PASS  ${label}`)
        : yield* new CreatePathFailed({
            message: `FAIL  ${label} (exit ${exitCode})\n${stdout.slice(-3000)}\n${stderr.slice(-3000)}`,
          });
    }).pipe(Effect.scoped);
  const catalogsOf = (project: string) =>
    fs.readFileString(path.join(root, project, "stack.effect.json")).pipe(
      Effect.flatMap(Schema.decodeEffect(Config)),
      Effect.map(({ catalogs }) => catalogs),
    );

  yield* step(
    `install ${cliSpec}`,
    root,
    "npm",
    "install",
    "--prefix",
    path.join(root, "cli"),
    "--no-audit",
    "--no-fund",
    cliSpec,
  );
  yield* step(
    `create a registry project from ${authorUrl}`,
    root,
    cli,
    "create",
    "reg",
    "--root",
    root,
    "--catalog",
    "official",
    "--catalog",
    `author=${authorUrl}`,
    "--target",
    "catalog/",
    "--yes",
    "--no-git",
  );
  const saved = yield* catalogsOf("reg");
  if (
    saved.length !== 2 ||
    saved[0]?.name !== "official" ||
    saved[1]?.name !== "author" ||
    saved[1].url !== authorUrl
  )
    return yield* new CreatePathFailed({
      message: `FAIL  saved sources: ${describe(saved)}`,
    });
  yield* Console.log("PASS  stack.effect.json saves official and author");

  const registry = path.join(root, "reg/apps/catalog-registry");
  yield* step(
    "validate the standalone catalog",
    registry,
    "bun",
    "run",
    "validate",
  );
  yield* step("build the standalone catalog", registry, "bun", "run", "build");

  // Serve the built catalog, then select it alone from a second project.
  const built = yield* fs.readFileString(
    path.join(registry, "dist/registry/v1/catalog.json"),
  );
  yield* HttpServer.serveEffect(
    Effect.succeed(
      HttpServerResponse.text(built, { contentType: "application/json" }),
    ),
  );
  const mine = yield* HttpServer.addressFormattedWith((address) =>
    Effect.succeed(`${address}/registry/v1/catalog.json`),
  );
  yield* step(
    "create a second project from the standalone catalog alone",
    root,
    cli,
    "create",
    "consumer",
    "--root",
    root,
    "--catalog",
    `mine=${mine}`,
    "--target",
    "app/:app-greeting",
    "--yes",
    "--no-git",
  );
  const consumer = yield* catalogsOf("consumer");
  const greeting = yield* fs.exists(
    path.join(root, "consumer/apps/app-demo/src/greeting.ts"),
  );
  if (!greeting || consumer.map(({ name }) => name).join() !== "mine")
    return yield* new CreatePathFailed({
      message: `FAIL  consumer project: greeting ${greeting}, sources ${describe(consumer)}`,
    });
  yield* Console.log(
    "PASS  the second project uses only the standalone catalog",
  );
});

const LoopbackServer = NodeHttpServer.layer(createServer, {
  host: "127.0.0.1",
  port: 0,
});

NodeRuntime.runMain(
  program.pipe(
    Effect.scoped,
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(Layer.merge(LoopbackServer, NodeServices.layer)),
  ),
  { disableErrorReporting: true },
);
