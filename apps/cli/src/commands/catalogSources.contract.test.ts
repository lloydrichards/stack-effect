import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
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
  Stream,
} from "effect";
import * as Stdio from "effect/Stdio";
import { Command } from "effect/unstable/cli";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { stackEffectCommand } from "../command";
import {
  CatalogProvider,
  OFFICIAL_CATALOG_URL,
} from "../service/CatalogProvider";
import { ConfigureService } from "../service/ConfigureService";

const decodePlanOutput = Schema.decodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      sources: Schema.Array(Schema.Struct({ name: Schema.String })),
      notes: Schema.Array(Schema.String),
      createCommand: Schema.String,
    }),
  ),
);

const runCommand = Command.runWith(stackEffectCommand, { version: "test" });

const urls = {
  acme: "https://acme.test/v1.json",
  beta: "https://beta.test/v1.json",
  ext: "https://ext.test/v1.json",
  down: "https://down.test/v1.json",
} as const;

const target = (kind: string, file: string): typeof TargetDefinition.Type => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [
    { _tag: "file", path: `{{targetPath}}/${file}`, contents: `${kind}\n` },
  ],
});

const module = (
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
const documents: Record<string, string> = {
  [urls.acme]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("acme"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    targets: [target("workspace", "ACME.md"), target("api", "api.txt")],
    modules: [
      module("acme-api-rest", "api", {
        scripts: [{ label: "Generate client", command: "acme generate" }],
      }),
    ],
  }),
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
};

const fixtureWith = (extra: Layer.Layer<never> = Layer.empty) =>
  Effect.gen(function* () {
    const official = yield* exportOfficialCatalog;
    const requested: Array<string> = [];
    const executed: Array<string> = [];
    const stdout: Array<string> = [];
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        requested.push(request.url);
        const body =
          request.url === OFFICIAL_CATALOG_URL
            ? official
            : documents[request.url];
        return HttpClientResponse.fromWeb(
          request,
          body === undefined
            ? new Response(null, { status: 503 })
            : new Response(body, {
                headers: { "content-type": "application/json" },
              }),
        );
      }),
    );
    // NOTE: The fake spawner records Finalize commands instead of running them.
    const spawner = Layer.succeed(ChildProcessSpawner, {
      spawn: (command: { command: string; args: ReadonlyArray<string> }) => {
        executed.push([command.command, ...command.args].join(" "));
        return Effect.succeed({
          stdout: Stream.empty,
          stderr: Stream.empty,
          exitCode: Effect.succeed(0),
          pid: Effect.succeed(1),
          kill: () => Effect.void,
          unref: Effect.void,
        });
      },
    } as never);
    const capturedConsole: Console.Console = Object.assign(
      Object.create(globalThis.console),
      {
        log: (value: string) => {
          stdout.push(String(value));
        },
        error: () => {},
      },
    );
    const layer = CatalogProvider.official.pipe(
      Layer.provideMerge(
        CatalogLoader.layer.pipe(
          Layer.provideMerge(CatalogCache.memory),
          Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, client)),
        ),
      ),
      Layer.provideMerge(ConfigureService.layer),
      Layer.provideMerge(Layer.merge(NodeServices.layer, spawner)),
      Layer.provideMerge(Layer.succeed(Console.Console, capturedConsole)),
    );
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "stack-effect-catalogs-",
    });
    const run = (args: ReadonlyArray<string>) =>
      runCommand([...args]).pipe(Effect.provide(Layer.merge(layer, extra)));
    const readConfig = (project: string) =>
      fs
        .readFileString(path.join(directory, project, "stack.effect.json"))
        .pipe(
          Effect.map((text) => JSON.parse(text) as Record<string, unknown>),
        );
    return {
      run,
      requested,
      executed,
      stdout,
      directory,
      path,
      fs,
      readConfig,
    };
  });
const fixture = fixtureWith();

const scoped = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | import("effect").Scope.Scope
  >,
) => effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const stdin = (value: unknown) =>
  Stdio.layerTest({
    stdin: Stream.make(new TextEncoder().encode(JSON.stringify(value))),
  });

describe("catalog source selection contract", () => {
  it.effect(
    "mismatch fails with a named (tagged) error",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, directory, path } = yield* fixture;
          yield* run([
            "create",
            "solo",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--root",
            directory,
          ]);
          const error = yield* Effect.flip(
            run([
              "add",
              "--root",
              path.join(directory, "solo"),
              "--catalog",
              "official",
              "--target",
              "api/other:acme-api-rest",
              "--yes",
              "--dry-run",
            ]),
          );
          assert.strictEqual(
            typeof error,
            "object",
            `got ${typeof error}: ${String(error)}`,
          );
          assert.property(error as object, "_tag");
        }),
      ),
    30_000,
  );

  it.effect(
    "invalid --catalog fails with a named (tagged) error",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, directory } = yield* fixture;
          const error = yield* Effect.flip(
            run([
              "create",
              "x",
              "--catalog",
              "acme",
              "--target",
              "package/domain:domain-api-contracts",
              "--yes",
              "--root",
              directory,
            ]),
          );
          assert.strictEqual(
            typeof error,
            "object",
            `got ${typeof error}: ${String(error)}`,
          );
        }),
      ),
    30_000,
  );

  it.effect(
    "rendered create output notes that custom scripts need --trust",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, stdout, directory } = yield* fixture;
          yield* run([
            "create",
            "solo",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--dry-run",
            "--root",
            directory,
          ]);
          const out = stdout.join("\n");
          assert.include(out, "--catalog");
          assert.match(out, /--trust/);
        }),
      ),
    30_000,
  );

  it.effect(
    "plan raw createCommand notes that custom scripts need --trust",
    () =>
      Effect.gen(function* () {
        const { run, stdout, directory } = yield* fixtureWith(
          stdin({
            selection: {
              targets: [
                {
                  identity: { kind: "api", name: "svc" },
                  modules: [{ id: "acme-api-rest" }],
                },
              ],
            },
            config: {
              name: "solo",
              runtime: { _tag: "bun" },
              catalogs: [{ name: "acme", url: urls.acme }],
            },
          }),
        );
        yield* run(["plan", "-f", "raw", "--root", directory]);
        const out = yield* decodePlanOutput(stdout.join("\n"));
        assert.deepStrictEqual(
          out.sources.map((source) => source.name),
          ["acme"],
        );
        assert.include(out.createCommand, "--catalog 'acme=");
        assert.notInclude(out.createCommand, "--trust");
        assert.match(out.notes.join("\n"), /--trust/);
      }).pipe(scoped),
    30_000,
  );

  it.effect(
    "graph mermaid output shows provenance",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, stdout } = yield* fixture;
          yield* run([
            "graph",
            "--format",
            "mermaid",
            "--catalog",
            `acme=${urls.acme}`,
            "--catalog",
            `beta=${urls.beta}`,
          ]);
          const out = stdout.join("\n");
          assert.include(out, "worker");
          assert.include(out, "beta");
        }),
      ),
    30_000,
  );

  it.effect(
    "custom-only: add keeps catalogs, plan --root reports sources, rendered command round-trips",
    () =>
      Effect.gen(function* () {
        const { run, stdout, directory, readConfig, path } = yield* fixtureWith(
          stdin({
            selection: {
              targets: [
                {
                  identity: { kind: "api", name: "svc" },
                  modules: [{ id: "acme-api-rest" }],
                },
              ],
            },
          }),
        );
        yield* run([
          "create",
          "solo",
          "--catalog",
          `acme=${urls.acme}`,
          "--target",
          "api/svc:acme-api-rest",
          "--yes",
          "--root",
          directory,
        ]);
        yield* run([
          "add",
          "--root",
          path.join(directory, "solo"),
          "--target",
          "api/two:acme-api-rest",
          "--yes",
        ]);
        const after = yield* readConfig("solo");
        assert.deepStrictEqual(
          after["catalogs"],
          [{ name: "acme", url: urls.acme }],
          "add dropped catalogs",
        );
        stdout.length = 0;
        yield* run([
          "plan",
          "-f",
          "raw",
          "--root",
          path.join(directory, "solo"),
        ]);
        const out = yield* decodePlanOutput(stdout.join("\n"));
        assert.deepStrictEqual(
          out.sources.map((source) => source.name),
          ["acme"],
        );
        const words = out.createCommand.split(/\s+/);
        const args = words
          .slice(words.indexOf("create"))
          .map((a) => a.replace(/^'|'$/g, ""));
        args[1] = "copy";
        yield* run([...args, "--yes", "--root", directory]);
        const copy = yield* readConfig("copy");
        const original = yield* readConfig("solo");
        assert.deepStrictEqual({ ...copy, name: "solo" }, original);
      }).pipe(scoped),
    60_000,
  );

  it.effect(
    "plan keeps saved sources when the stdin config lists none, and graph reads --root",
    () =>
      Effect.gen(function* () {
        const { run, stdout, directory, path } = yield* fixtureWith(
          stdin({
            selection: {
              targets: [
                {
                  identity: { kind: "api", name: "svc" },
                  modules: [{ id: "acme-api-rest" }],
                },
              ],
            },
            config: { name: "solo", runtime: { _tag: "bun" } },
          }),
        );
        yield* run([
          "create",
          "solo",
          "--catalog",
          `acme=${urls.acme}`,
          "--target",
          "api/svc:acme-api-rest",
          "--yes",
          "--root",
          directory,
        ]);
        const project = path.join(directory, "solo");
        stdout.length = 0;
        yield* run(["plan", "-f", "raw", "--root", project]);
        const out = yield* decodePlanOutput(stdout.join("\n"));
        assert.deepStrictEqual(
          out.sources.map((source) => source.name),
          ["acme"],
        );
        stdout.length = 0;
        yield* run(["graph", "--format", "mermaid", "--root", project]);
        assert.include(stdout.join("\n"), "acme-api-rest #40;acme#41;");
      }).pipe(scoped),
    60_000,
  );
});
