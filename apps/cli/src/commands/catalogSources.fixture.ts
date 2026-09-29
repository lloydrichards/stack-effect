import { NodeServices } from "@effect/platform-node";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import {
  CatalogDocument,
  type ModuleDefinition,
  ModuleId,
  type TargetDefinition,
  TargetKind,
} from "@repo/domain/Catalog";
import { CatalogCache, CatalogLoader } from "@repo/scaffold";
import {
  Console,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  Scope,
  Sink,
  Stream,
} from "effect";
import * as Stdio from "effect/Stdio";
import { Command } from "effect/unstable/cli";
import {
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { stackEffectCommand } from "../command";
import {
  CatalogProvider,
  OFFICIAL_CATALOG_URL,
} from "../service/CatalogProvider";
import { ConfigureService } from "../service/ConfigureService";

export const runCommand = Command.runWith(stackEffectCommand, {
  version: "test",
});

export const urls = {
  acme: "https://acme.test/v1.json",
  acmeWithQuery: "https://acme.test/v1.json?v=1",
  beta: "https://beta.test/v1.json",
  ext: "https://ext.test/v1.json",
  down: "https://down.test/v1.json",
  sneaky: "https://sneaky.test/v1.json",
} as const;

export const target = (
  kind: string,
  file: string,
): typeof TargetDefinition.Type => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [
    { _tag: "file", path: `{{targetPath}}/${file}`, contents: `${kind}\n` },
  ],
});

export const module = (
  id: string,
  kind: string,
  extra: Partial<typeof ModuleDefinition.Type> = {},
): typeof ModuleDefinition.Type => ({
  id: ModuleId.make(id),
  title: id,
  description: `The ${id} module`,
  supportedOn: [{ _tag: "kind", kind: TargetKind.make(kind) }],
  dependencies: [],
  contributions: [
    { _tag: "file", path: `{{targetPath}}/${id}.txt`, contents: `${id}\n` },
  ],
  ...extra,
});

const encode = Schema.encodeSync(Schema.fromJsonString(CatalogDocument));

const acme = encode({
  formatVersion: 1,
  catalogId: Schema.NonEmptyString.make("acme"),
  requiredCapabilities: ["contribution:file", "token:targetPath"],
  targets: [target("workspace", "ACME.md"), target("api", "api.txt")],
  modules: [
    module("acme-api-rest", "api", {
      scripts: [{ label: "Generate client", command: "acme generate" }],
    }),
  ],
});

/** Custom catalog documents served by the routed fake registry. */
export const documents: Readonly<Record<string, string>> = {
  [urls.acme]: acme,
  [urls.acmeWithQuery]: acme,
  [urls.beta]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("beta"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    targets: [target("worker", "worker.txt")],
    modules: [],
  }),
  [urls.ext]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("ext"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    requires: ["official"],
    targets: [],
    modules: [module("ext-audit", "package")],
  }),
  [urls.sneaky]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("sneaky"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    targets: [target("workspace", "SNEAKY.md"), target("api", "api.txt")],
    modules: [
      module("sneaky-api", "api", {
        // Same command string as the official config-derived install script,
        // once at the repo root and once in the target directory.
        scripts: [
          {
            label: "Sneaky root install",
            command: "bun install",
            workdir: ".",
          },
          { label: "Sneaky target install", command: "bun install" },
        ],
      }),
    ],
  }),
};

export const jsonResponse = (body: string) =>
  new Response(body, { headers: { "content-type": "application/json" } });

export const unavailableResponse = () => new Response(null, { status: 503 });

/** A fake registry that records each requested URL; `attempt` is 1-based. */
export const countingClient = (
  respond: (
    request: HttpClientRequest.HttpClientRequest,
    attempt: number,
  ) => Response,
) => {
  const requested: Array<string> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requested.push(request.url);
      return HttpClientResponse.fromWeb(
        request,
        respond(request, requested.length),
      );
    }),
  );
  return { client, requested };
};

/** A Console that keeps stdout and stderr lines for assertions. */
export const captureConsole = () => {
  const stdout: Array<string> = [];
  const stderr: Array<string> = [];
  const console: Console.Console = Object.assign(
    Object.create(globalThis.console),
    {
      log: (value: unknown) => {
        stdout.push(String(value));
      },
      error: (value: unknown) => {
        stderr.push(String(value));
      },
    },
  );
  return {
    stdout,
    stderr,
    layer: Layer.succeed(Console.Console, console),
  };
};

export interface ExecutedCommand {
  readonly command: string;
  readonly cwd: string | undefined;
}

const describeCommand = (command: ChildProcess.Command): ExecutedCommand =>
  ChildProcess.isStandardCommand(command)
    ? {
        command: [command.command, ...command.args].join(" "),
        cwd: command.options.cwd,
      }
    : { command: "<piped>", cwd: undefined };

/** Records Finalize commands with their working directory instead of running them. */
export const recordingSpawner = (executed: Array<ExecutedCommand>) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        executed.push(describeCommand(command));
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );

/** The production CLI layer over a controlled registry client. */
export const cliLayer = (
  client: HttpClient.HttpClient,
  services: Layer.Layer<
    Layer.Success<typeof NodeServices.layer>
  > = NodeServices.layer,
) =>
  CatalogProvider.official.pipe(
    Layer.provideMerge(
      CatalogLoader.layer.pipe(
        Layer.provideMerge(CatalogCache.memory),
        Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, client)),
      ),
    ),
    Layer.provideMerge(ConfigureService.layer),
    Layer.provideMerge(services),
  );

export const stdinLayer = (value: unknown) =>
  Stdio.layerTest({
    stdin: Stream.make(new TextEncoder().encode(JSON.stringify(value))),
  });

/** What one CLI run printed, requested, and executed. */
export interface RunCapture {
  readonly stdout: ReadonlyArray<string>;
  readonly stderr: ReadonlyArray<string>;
  readonly requested: ReadonlyArray<string>;
  readonly executed: ReadonlyArray<ExecutedCommand>;
}

export interface RunOptions {
  /** JSON value piped to stdin, for `plan`. */
  readonly stdin?: unknown;
}

const decodeJsonRecord = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

/**
 * A temp root plus a CLI runner whose registry serves the official catalog
 * and `documents`, and answers 503 for any other URL.
 */
export const catalogSourcesFixture = Effect.gen(function* () {
  const official = yield* exportOfficialCatalog;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "stack-effect-catalogs-",
  });

  const prepare = (options: RunOptions) => {
    const registry = countingClient((request) => {
      const body =
        request.url === OFFICIAL_CATALOG_URL
          ? official
          : documents[request.url];
      return body === undefined ? unavailableResponse() : jsonResponse(body);
    });
    const executed: Array<ExecutedCommand> = [];
    const output = captureConsole();
    const layer = cliLayer(
      registry.client,
      Layer.merge(NodeServices.layer, recordingSpawner(executed)),
    ).pipe(
      Layer.provideMerge(output.layer),
      // NOTE: Merged last so the test stdin replaces the Node one.
      Layer.merge(
        options.stdin === undefined ? Layer.empty : stdinLayer(options.stdin),
      ),
    );
    const capture: RunCapture = {
      stdout: output.stdout,
      stderr: output.stderr,
      requested: registry.requested,
      executed,
    };
    return { layer, capture };
  };

  /** Runs the CLI and returns what that run captured. */
  const run = (args: ReadonlyArray<string>, options: RunOptions = {}) =>
    Effect.suspend(() => {
      const { layer, capture } = prepare(options);
      return runCommand([...args]).pipe(
        Effect.provide(layer),
        Effect.as(capture),
      );
    });

  /** Runs the CLI expecting failure; fails if the command succeeds. */
  const runFailing = (args: ReadonlyArray<string>, options: RunOptions = {}) =>
    Effect.suspend(() => {
      const { layer, capture } = prepare(options);
      return runCommand([...args]).pipe(
        Effect.provide(layer),
        Effect.flip,
        Effect.map((error) => ({ ...capture, error })),
      );
    });

  const readConfigAt = (projectRoot: string) =>
    fs
      .readFileString(path.join(projectRoot, "stack.effect.json"))
      .pipe(Effect.flatMap(decodeJsonRecord));

  const readConfig = (project: string) =>
    readConfigAt(path.join(directory, project));

  return {
    run,
    runFailing,
    directory,
    path,
    fs,
    readConfig,
    readConfigAt,
  };
});

/** Provides the Node services and scope that the fixture's temp root needs. */
export const withNodeServices = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer));

/**
 * The `stack-effect create …` arguments of a rendered create command, from
 * the `create` word on, with shell quotes removed.
 */
export const parseRenderedCreateCommand = (rendered: string) => {
  const words = rendered.trim().split(/\s+/);
  return words
    .slice(words.indexOf("create"))
    .map((word) => word.replace(/^'(.*)'$/, "$1"));
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
