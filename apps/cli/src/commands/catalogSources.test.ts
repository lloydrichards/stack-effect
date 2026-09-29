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

describe("catalog source selection", () => {
  it.effect(
    "keeps official-only projects free of a catalogs field",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, requested, directory, readConfig } = yield* fixture;
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
          const config = yield* readConfig("plain");
          assert.notProperty(config, "catalogs");
          assert.strictEqual(config["lint"], "oxlint");
          assert.deepStrictEqual(requested, [OFFICIAL_CATALOG_URL]);
        }),
      ),
    30_000,
  );

  it.effect(
    "creates a custom-only project without official definitions and saves its sources",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, requested, executed, directory, path, fs, readConfig } =
            yield* fixture;
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
          const config = yield* readConfig("solo");
          assert.deepStrictEqual(config["catalogs"], [
            { name: "acme", url: urls.acme },
          ]);
          for (const field of ["lint", "format", "test", "monorepo"])
            assert.notProperty(config, field);
          assert.isTrue(
            yield* fs.exists(path.join(directory, "solo", "ACME.md")),
          );
          assert.notInclude(requested, OFFICIAL_CATALOG_URL);
          // --yes runs install but not the custom catalog's script.
          assert.isTrue(
            executed.some((command) => command.includes("install")),
          );
          assert.notInclude(executed.join("\n"), "acme generate");

          yield* run([
            "add",
            "--root",
            path.join(directory, "solo"),
            "--target",
            "api/other:acme-api-rest",
            "--yes",
            "--dry-run",
          ]);
          assert.notInclude(requested, OFFICIAL_CATALOG_URL);

          const mismatch = yield* Effect.flip(
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
          assert.include(String(mismatch), "stack.effect.json saves acme=");
        }),
      ),
  );

  it.effect("runs custom catalog scripts only with --trust", () =>
    scoped(
      Effect.gen(function* () {
        const { run, executed, directory } = yield* fixture;
        yield* run([
          "create",
          "trusted",
          "--catalog",
          `acme=${urls.acme}`,
          "--target",
          "api/svc:acme-api-rest",
          "--yes",
          "--trust",
          "--root",
          directory,
        ]);
        assert.include(executed.join("\n"), "acme generate");
      }),
    ),
  );

  it.effect(
    "composes a custom module against the official catalog it requires",
    () =>
      scoped(
        Effect.gen(function* () {
          const { run, requested, stdout, directory } = yield* fixture;
          yield* run([
            "create",
            "mixed",
            "--catalog",
            "official",
            "--catalog",
            `ext=${urls.ext}`,
            "--target",
            "package/domain:ext-audit",
            "--yes",
            "--no-git",
            "--dry-run",
            "--root",
            directory,
          ]);
          assert.sameMembers(requested, [OFFICIAL_CATALOG_URL, urls.ext]);
          assert.include(stdout.join("\n"), "ext-audit.txt");
        }),
      ),
  );

  it.effect("unions two custom catalogs", () =>
    scoped(
      Effect.gen(function* () {
        const { run, requested, stdout, directory } = yield* fixture;
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
          "--dry-run",
          "--root",
          directory,
        ]);
        assert.sameMembers(requested, [urls.acme, urls.beta]);
        assert.include(stdout.join("\n"), "worker.txt");
      }),
    ),
  );

  it.effect("stops before writing when a selected source is unavailable", () =>
    scoped(
      Effect.gen(function* () {
        const { run, directory, path, fs } = yield* fixture;
        const error = yield* Effect.flip(
          run([
            "create",
            "broken",
            "--catalog",
            `acme=${urls.acme}`,
            "--catalog",
            `down=${urls.down}`,
            "--target",
            "api/svc:acme-api-rest",
            "--yes",
            "--root",
            directory,
          ]),
        );
        assert.include(
          error instanceof Error ? error.message : String(error),
          "Catalog source down",
        );
        assert.isFalse(yield* fs.exists(path.join(directory, "broken")));
      }),
    ),
  );

  it.effect("rejects an invalid selection before any request", () =>
    scoped(
      Effect.gen(function* () {
        const { run, requested, directory } = yield* fixture;
        const error = yield* Effect.flip(
          run([
            "create",
            "reserved",
            "--catalog",
            "official=https://mirror.test/v1.json",
            "--target",
            "package/domain:domain-api-contracts",
            "--yes",
            "--root",
            directory,
          ]),
        );
        assert.include(String(error), "Invalid --catalog selection");
        assert.deepStrictEqual(requested, []);
      }),
    ),
  );
});
