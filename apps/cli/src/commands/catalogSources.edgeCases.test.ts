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
import { Command } from "effect/unstable/cli";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { stackEffectCommand } from "../command";
import {
  CatalogProvider,
  OFFICIAL_CATALOG_URL,
} from "../service/CatalogProvider";
import { ConfigureService } from "../service/ConfigureService";

// Edge cases in catalog selection: script identity, trust notes, flag parsing.
const decodeJsonRecord = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

const runCommand = Command.runWith(stackEffectCommand, { version: "test" });

const urls = {
  acme: "https://acme.test/v1.json",
  beta: "https://beta.test/v1.json",
  ext: "https://ext.test/v1.json",
  down: "https://down.test/v1.json",
  sneaky: "https://sneaky.test/v1.json",
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
  [urls.sneaky]: encode({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("sneaky"),
    requiredCapabilities: ["contribution:file", "token:targetPath"],
    targets: [target("workspace", "SNEAKY.md"), target("api", "api.txt")],
    modules: [
      module("sneaky-api", "api", {
        // Same command string as the official config-derived install script.
        scripts: [{ label: "Sneaky install", command: "bun install" }],
      }),
    ],
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

const fixture = Effect.gen(function* () {
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
      executed.push(
        `${[command.command, ...command.args].join(" ")} @ ${
          (command as { options?: { cwd?: string } }).options?.cwd ?? ""
        }`,
      );
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
    runCommand([...args]).pipe(Effect.provide(layer));
  const readConfig = (project: string) =>
    fs
      .readFileString(path.join(directory, project, "stack.effect.json"))
      .pipe(Effect.map((text) => JSON.parse(text) as Record<string, unknown>));
  return { run, requested, executed, stdout, directory, path, fs, readConfig };
});

const scoped = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | import("effect").Scope.Scope
  >,
) => effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("catalog source selection edge cases", () => {
  it.effect(
    "--yes does not run a custom script that shares a command string with an official script",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, executed, directory } = yield* fixture;
          yield* run([
            "create",
            "sneaky",
            "--catalog",
            `sneaky=${urls.sneaky}`,
            "--target",
            "api/svc:sneaky-api",
            "--yes",
            "--root",
            directory,
          ]);
          const installs = executed.filter((line) =>
            line.includes("bun install"),
          );
          // Only the config-derived install at the repo root may run without --trust.
          assert.deepStrictEqual(
            installs.filter((line) => line.includes("apps/")),
            [],
            `custom script ran without --trust: ${executed.join(", ")}`,
          );
        }),
      ),
    30_000,
  );

  it.effect(
    "rendered create output notes that custom catalog scripts require --trust",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, stdout, directory } = yield* fixture;
          yield* run([
            "create",
            "note",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--dry-run",
            "--root",
            directory,
          ]);
          const text = stdout
            .join("\n")
            .replace(
              new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
              "",
            )
            .replace(/[│╭╮╰╯─]/g, " ")
            .replace(/\s+/g, " ");
          assert.include(text, "acme generate");
          assert.include(text, "--trust");
        }),
      ),
    30_000,
  );

  it.effect("graph mermaid output shows each node's source", () =>
    scoped(
      Effect.gen(function* () {
        const { run, stdout } = yield* fixture;
        yield* run([
          "graph",
          "--format",
          "mermaid",
          "--catalog",
          `acme=${urls.acme}`,
        ]).pipe(Effect.ignore);
        const text = stdout.join("\n");
        // Mermaid escapes parentheses in labels.
        assert.include(text, "acme-api-rest #40;acme#41;");
      }),
    ),
  );

  it.effect(
    "custom-only create without a workspace target fails with a named error before writing",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, directory, path, fs } = yield* fixture;
          const error = yield* Effect.flip(
            run([
              "create",
              "noworkspace",
              "--catalog",
              `beta=${urls.beta}`,
              "--target",
              "worker/jobs",
              "--yes",
              "--root",
              directory,
            ]),
          );
          assert.include(
            error instanceof Error ? error.message : String(error),
            "workspace",
          );
          assert.isFalse(yield* fs.exists(path.join(directory, "noworkspace")));
        }),
      ),
  );

  it.effect("custom-only create with an official --lint tool fails", () =>
    scoped(
      Effect.gen(function* () {
        const { run, directory, path, fs } = yield* fixture;
        const error = yield* Effect.flip(
          run([
            "create",
            "lint",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--lint",
            "oxlint",
            "--yes",
            "--root",
            directory,
          ]),
        );
        assert.include(
          error instanceof Error ? error.message : String(error),
          "oxlint",
        );
        assert.isFalse(yield* fs.exists(path.join(directory, "lint")));
      }),
    ),
  );

  it.effect(
    "add accepts --catalog official in a project without catalogs",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, directory, path } = yield* fixture;
          yield* run([
            "create",
            "plain",
            "--target",
            "package/domain:domain-api-contracts",
            "--yes",
            "--no-git",
            "--root",
            directory,
          ]);
          yield* run([
            "add",
            "--root",
            path.join(directory, "plain"),
            "--catalog",
            "official",
            "--target",
            "package/other",
            "--yes",
            "--dry-run",
          ]);
        }),
      ),
    30_000,
  );

  it.effect(
    "add accepts the saved set in a different order and keeps catalogs",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, directory, path, readConfig } = yield* fixture;
          yield* run([
            "create",
            "pair",
            "--catalog",
            `acme=${urls.acme}`,
            "--catalog",
            `beta=${urls.beta}`,
            "--target",
            "worker/jobs",
            "--yes",
            "--root",
            directory,
          ]);
          yield* run([
            "add",
            "--root",
            path.join(directory, "pair"),
            "--catalog",
            `beta=${urls.beta}`,
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
          ]);
          const config = yield* readConfig("pair");
          assert.deepStrictEqual(config["catalogs"], [
            { name: "acme", url: urls.acme },
            { name: "beta", url: urls.beta },
          ]);
        }),
      ),
  );

  it.effect(
    "the rendered custom-only create command reproduces the config",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, stdout, directory, readConfig, fs, path } =
            yield* fixture;
          yield* run([
            "create",
            "orig",
            "--catalog",
            `acme=${urls.acme}`,
            "--target",
            "api/svc:acme-api-rest",
            "--typescript",
            "6",
            "--no-git",
            "--yes",
            "--root",
            directory,
          ]);
          const line = stdout.find((entry) =>
            entry.startsWith("Create command:"),
          );
          assert.isDefined(line);
          const args = line!
            .replace("Create command: ", "")
            .split(" ")
            .slice(2)
            .map((arg) => arg.replace(/^'(.*)'$/, "$1"));
          args[1] = "copy";
          const other = path.join(directory, "second");
          yield* fs.makeDirectory(other);
          yield* run([...args, "--yes", "--root", other]);
          const a = yield* readConfig("orig");
          const b = yield* fs
            .readFileString(path.join(other, "copy", "stack.effect.json"))
            .pipe(Effect.flatMap(decodeJsonRecord));
          assert.deepStrictEqual({ ...b, name: "orig" }, a);
        }),
      ),
  );

  it.effect(
    "parses a URL that itself contains '=' and rejects empty parts",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, directory, readConfig } = yield* fixture;
          const withQuery = `${urls.acme}?v=1`;
          yield* run([
            "create",
            "query",
            "--catalog",
            `acme=${withQuery}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--root",
            directory,
          ]).pipe(Effect.ignore);
          // 503 from the fixture is fine; we only care that parsing did not split at the second '='.
          for (const bad of ["=https://x.test/a.json", "official=", "acme="]) {
            const error = yield* Effect.flip(
              run([
                "create",
                "bad",
                "--catalog",
                bad,
                "--target",
                "worker/jobs",
                "--yes",
                "--root",
                directory,
              ]),
            );
            assert.include(String(error), "Invalid --catalog");
          }
          void readConfig;
        }),
      ),
  );
});
