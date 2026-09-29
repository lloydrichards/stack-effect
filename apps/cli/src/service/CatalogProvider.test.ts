import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { CatalogDocument } from "@repo/domain/Catalog";
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
import { stackEffectCommand } from "../command";
import { CatalogProvider } from "./CatalogProvider";
import { ConfigureService } from "./ConfigureService";

const document = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
  formatVersion: 1,
  catalogId: Schema.NonEmptyString.make("fixture"),
  requiredCapabilities: [],
  targets: [],
  modules: [],
});

const runCommand = Command.runWith(stackEffectCommand, { version: "test" });

const layerFor = (client: HttpClient.HttpClient) =>
  CatalogProvider.official.pipe(
    Layer.provideMerge(
      CatalogLoader.layer.pipe(
        Layer.provideMerge(CatalogCache.memory),
        Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, client)),
      ),
    ),
    Layer.provideMerge(ConfigureService.layer),
    Layer.provideMerge(NodeServices.layer),
  );

it.effect("keeps help and version independent of the registry", () => {
  let requests = 0;
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests++;
      return HttpClientResponse.fromWeb(
        request,
        new Response(document, {
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  return Effect.gen(function* () {
    yield* runCommand(["--help"]);
    yield* runCommand(["--version"]);
    assert.strictEqual(requests, 0);
  }).pipe(Effect.provide(layerFor(client)));
});

it.effect("loads once for a graph command through controlled HTTP", () => {
  let requests = 0;
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests++;
      return HttpClientResponse.fromWeb(
        request,
        new Response(document, {
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  return Effect.gen(function* () {
    yield* runCommand(["graph", "--format", "mermaid"]);
    assert.strictEqual(requests, 1);
  }).pipe(Effect.provide(layerFor(client)));
});

it.effect("uses changed file content on the next generation command", () =>
  Effect.gen(function* () {
    const initial = yield* exportOfficialCatalog;
    const decoded = yield* Schema.decodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )(initial);
    const revised = yield* Schema.encodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )({
      ...decoded,
      targets: decoded.targets.map((target) => ({
        ...target,
        contributions:
          target.kind === "client-react"
            ? target.contributions.map((contribution) =>
                contribution._tag === "file" &&
                contribution.path === "{{targetPath}}/src/main.tsx"
                  ? {
                      ...contribution,
                      contents: `${contribution.contents}\n// Registry revision marker.\n`,
                    }
                  : contribution,
              )
            : target.contributions,
      })),
    });
    assert.notStrictEqual(revised, initial);
    let requests = 0;
    const stdout: Array<string> = [];
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "stack-effect-content-update-",
    });
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        requests++;
        return HttpClientResponse.fromWeb(
          request,
          new Response(requests === 1 ? initial : revised, {
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
    const capturedConsole: Console.Console = Object.assign(
      Object.create(globalThis.console),
      {
        log: (value: string) => {
          stdout.push(value);
        },
      },
    );
    yield* Effect.gen(function* () {
      const args = [
        "create",
        "demo",
        "--target",
        "client-react/web:client-react-http-api",
        "--yes",
        "--no-git",
        "--dry-run",
        "--show-files",
        "--root",
        directory,
      ];
      yield* runCommand(args);
      yield* runCommand(args);
    }).pipe(
      Effect.provide(
        Layer.merge(
          layerFor(client),
          Layer.succeed(Console.Console, capturedConsole),
        ),
      ),
    );
    assert.strictEqual(requests, 2);
    assert.notDeepEqual(stdout[0], stdout[1]);
    assert.notInclude(stdout[0] ?? "", "Registry revision marker");
    assert.include(stdout[1] ?? "", "Registry revision marker");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("stops init before writing when the registry is unavailable", () => {
  let requests = 0;
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests++;
      return HttpClientResponse.fromWeb(
        request,
        new Response(null, { status: 503 }),
      );
    }),
  );
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "stack-effect-init-failure-",
    });
    const projectRoot = path.join(directory, "demo");
    yield* Effect.flip(
      runCommand(["init", "demo", "--yes", "--root", directory]),
    );
    assert.strictEqual(requests, 1);
    assert.isFalse(yield* fs.exists(projectRoot));
  }).pipe(Effect.scoped, Effect.provide(layerFor(client)));
});

it.effect(
  "keeps JSON stdout parseable when a later command uses stale data",
  () => {
    let requests = 0;
    const stdout: Array<string> = [];
    const stderr: Array<string> = [];
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        requests++;
        return HttpClientResponse.fromWeb(
          request,
          requests === 1
            ? new Response(document, {
                headers: { "content-type": "application/json" },
              })
            : new Response(null, { status: 503 }),
        );
      }),
    );
    const capturedConsole: Console.Console = Object.assign(
      Object.create(globalThis.console),
      {
        log: (value: string) => {
          stdout.push(value);
        },
        error: (value: string) => {
          stderr.push(value);
        },
      },
    );
    return Effect.gen(function* () {
      yield* runCommand(["schema"]);
      yield* runCommand(["schema"]);
      assert.strictEqual(requests, 2);
      assert.strictEqual(stdout.length, 2);
      assert.isObject(
        yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(
          stdout[1] ?? "",
        ),
      );
      assert.include(
        stderr.join("\n"),
        "catalog official (https://stack-effect.lloydrichards.dev/registry/v1/catalog.json): using cached data",
      );
    }).pipe(
      Effect.provide(
        Layer.merge(
          layerFor(client),
          Layer.succeed(Console.Console, capturedConsole),
        ),
      ),
    );
  },
);

it.effect(
  "reports a malformed existing config before requesting the registry",
  () => {
    let requests = 0;
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        requests++;
        return HttpClientResponse.fromWeb(
          request,
          new Response(null, { status: 503 }),
        );
      }),
    );
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-config-",
      });
      yield* fs.writeFileString(path.join(directory, "stack.effect.json"), "{");
      const error = yield* Effect.flip(
        runCommand([
          "add",
          "--yes",
          "--root",
          directory,
          "--target",
          "package/demo:package-db-sqlite",
          "--dry-run",
        ]),
      );
      assert.isTrue(
        typeof error === "object" &&
          error !== null &&
          "_tag" in error &&
          error._tag === "MalformedConfigError",
      );
      assert.strictEqual(requests, 0);
    }).pipe(Effect.scoped, Effect.provide(layerFor(client)));
  },
);

it.effect("parses planning stdin before requesting the registry", () => {
  let requests = 0;
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests++;
      return HttpClientResponse.fromWeb(
        request,
        new Response(null, { status: 503 }),
      );
    }),
  );
  return Effect.gen(function* () {
    yield* Effect.flip(runCommand(["plan"]));
    assert.strictEqual(requests, 0);
  }).pipe(
    Effect.provide(
      Layer.merge(
        layerFor(client),
        Stdio.layerTest({ stdin: Stream.make(new TextEncoder().encode("{")) }),
      ),
    ),
  );
});

it.effect(
  "reports missing planning configuration before requesting the registry",
  () => {
    let requests = 0;
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        requests++;
        return HttpClientResponse.fromWeb(
          request,
          new Response(null, { status: 503 }),
        );
      }),
    );
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-missing-config-",
      });
      const error = yield* Effect.flip(
        runCommand(["plan", "--root", directory]),
      );
      assert.include(String(error), "No config found");
      assert.strictEqual(requests, 0);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.merge(
          layerFor(client),
          Stdio.layerTest({
            stdin: Stream.make(
              new TextEncoder().encode('{"selection":{"targets":[]}}'),
            ),
          }),
        ),
      ),
    );
  },
);
