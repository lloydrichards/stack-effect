import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import {
  CatalogDocument,
  ModuleCapability,
  type ModuleDefinition,
  ModuleId,
  type TargetDefinition,
  TargetIdentity,
  TargetKind,
  OFFICIAL_CATALOG_URL,
} from "@repo/domain/Catalog";
import { CatalogCache, CatalogLoader } from "@repo/scaffold/Catalog";
import * as MockTerminal from "@repo/tui/test/MockTerminal";
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
import { Command } from "effect/cli";
import type * as Digest from "effect/crypto/Digest";
import {
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Stdio from "effect/Stdio";
import type * as Terminal from "effect/Terminal";
import { stackEffectCommand } from "../../src/command";
import { CatalogProvider } from "../../src/service/CatalogProvider";
import { ConfigureService } from "../../src/service/ConfigureService";

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
  providers: "https://providers.test/v1.json",
  implications: "https://implications.test/v1.json",
} as const;

export const target = (kind: string, file: string): TargetDefinition => ({
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
  extra: Partial<ModuleDefinition> = {},
): ModuleDefinition => ({
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

const implies = (kind: string, id: string) => ({
  targetKind: TargetKind.make(kind),
  moduleId: ModuleId.make(id),
});

const acme = encode({
  formatVersion: 1,
  catalogId: Schema.NonEmptyString.make("acme"),
  requiredCapabilities: ["contribution:file", "token:targetPath"],
  targets: [target("workspace", "ACME.md"), target("api", "api.txt")],
  modules: [
    module("acme-api-rest", "api", {
      scripts: [
        {
          label: "Generate client",
          command: "acme generate",
          phase: "finalize",
        },
      ],
    }),
  ],
});

/** Custom catalog documents served by the routed fake registry. */
export const documents: Readonly<Record<string, string>> = {
  [urls.providers]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("providers"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    targets: [
      { ...target("api", "api.txt"), defaultName: "svc" },
      { ...target("server", "server.txt"), defaultName: "api" },
      target("workspace", "PROVIDERS.md"),
      target("package", "package.txt"),
    ],
    modules: [
      // Requires the repository module, which in turn requires a SQL provider.
      module("api-todos", "api", {
        dependencies: [
          {
            _tag: "required-module",
            target: new TargetIdentity({
              kind: TargetKind.make("package"),
              name: "db",
            }),
            moduleId: ModuleId.make("todo-repository"),
          },
        ],
      }),
      module("todo-repository", "package", {
        dependencies: [
          {
            _tag: "required-capability",
            target: new TargetIdentity({
              kind: TargetKind.make("package"),
              name: "db",
            }),
            capability: ModuleCapability.make("db-sql"),
          },
        ],
      }),
      module("api-web", "api", {
        supportedOn: [
          {
            _tag: "identity",
            identity: new TargetIdentity({
              kind: TargetKind.make("api"),
              name: "svc",
            }),
          },
        ],
        dependencies: [
          {
            _tag: "required-capability",
            target: new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "api",
            }),
            capability: ModuleCapability.make("http-server"),
          },
        ],
      }),
      module("server-provider", "server", {
        provides: [ModuleCapability.make("http-server")],
      }),
      module("sql-sqlite", "package", {
        provides: [ModuleCapability.make("db-sql")],
      }),
      module("sql-postgres", "package", {
        provides: [ModuleCapability.make("db-sql")],
      }),
    ],
  }),
  [urls.implications]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("implications"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    targets: [
      target("app", "app.txt"),
      target("workspace", "IMPLICATIONS.md"),
      target("server", "server.txt"),
      target("client", "client.txt"),
      target("package", "package.txt"),
      target("worker", "worker.txt"),
    ],
    modules: [
      module("origin", "app", {
        implies: [
          implies("server", "relay"),
          implies("client", "client-base"),
          implies("package", "library"),
        ],
      }),
      // Placed on the client while the server is walked, before the package.
      module("relay", "server", {
        implies: [implies("client", "relay-client")],
      }),
      module("client-base", "client"),
      module("relay-client", "client", {
        implies: [implies("worker", "job")],
      }),
      module("library", "package", { implies: [implies("worker", "job")] }),
      module("job", "worker"),
    ],
  }),
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
            phase: "finalize",
          },
          {
            label: "Sneaky target install",
            command: "bun install",
            phase: "finalize",
          },
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

export type ExecutedCommand = {
  readonly command: string;
  readonly cwd: string | undefined;
};

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

const TestNodeServices = Layer.merge(NodeServices.layer, NodeCrypto.layer);

/** The production CLI layer over a controlled registry client. */
export const cliLayer = (
  client: HttpClient.HttpClient,
  services: Layer.Layer<
    Layer.Success<typeof TestNodeServices>
  > = TestNodeServices,
) =>
  CatalogProvider.official.pipe(
    Layer.provideMerge(
      CatalogLoader.layer.pipe(
        Layer.provideMerge(CatalogCache.layerMemory),
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
export type RunCapture = {
  readonly stdout: ReadonlyArray<string>;
  readonly stderr: ReadonlyArray<string>;
  readonly requested: ReadonlyArray<string>;
  readonly executed: ReadonlyArray<ExecutedCommand>;
};

export type RunOptions = {
  /** JSON value piped to stdin, for `plan`. */
  readonly stdin?: unknown;
  /** Keys queued on a mock terminal before the command starts its prompts. */
  readonly input?: Effect.Effect<void, never, Terminal.Terminal>;
};

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
      Layer.merge(TestNodeServices, recordingSpawner(executed)),
    ).pipe(
      Layer.provideMerge(output.layer),
      // NOTE: Merged last so the test stdin replaces the Node one.
      Layer.merge(
        options.stdin === undefined ? Layer.empty : stdinLayer(options.stdin),
      ),
      // NOTE: Merged last so prompts read the mock terminal, not the Node one.
      Layer.merge(
        options.input === undefined ? Layer.empty : MockTerminal.layer,
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
      return Effect.andThen(
        options.input ?? Effect.void,
        runCommand([...args]),
      ).pipe(Effect.provide(layer), Effect.as(capture));
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
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | Digest.Digest | Scope.Scope
  >,
) => effect.pipe(Effect.scoped, Effect.provide(TestNodeServices));

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
