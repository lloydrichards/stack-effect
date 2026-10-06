import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { officialCatalogLayerWith } from "@repo/catalog-official/service";
import { Apply } from "@repo/domain/Apply";
import {
  type Contribution,
  type ModuleDefinition,
  ModuleId,
  PackageTargetPath,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import { ApplyWorkspaceService, BlueprintService } from "@repo/scaffold";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// Opt-in native coverage: select this file through apps/cli's test:e2e script.
// Missing Deno is a failure, not a skip. Deno may resolve npm packages and write caches.
const manifestCodec = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optional(Schema.String),
    workspaces: Schema.optional(Schema.Array(Schema.String)),
    workspace: Schema.optional(Schema.Array(Schema.String)),
    packageManager: Schema.optional(Schema.String),
    devDependencies: Schema.optional(
      Schema.Struct({
        "@repo/config-typescript": Schema.optional(Schema.String),
      }),
    ),
  }),
);
const probeCodec = Schema.fromJsonString(
  Schema.Struct({
    value: Schema.String,
    clientUrl: Schema.String,
    codecsUrl: Schema.String,
    version: Schema.NonEmptyString,
    pid: Schema.Finite,
  }),
);
const packageIdentity = (name: string) =>
  new TargetIdentity({ kind: TargetKind.make("package"), name });
const file = (path: string, contents: string): typeof Contribution.Type => ({
  _tag: "file",
  path,
  contents,
});
const entry = (
  field: "exports" | "dependencies",
  name: string,
  value: string,
): typeof Contribution.Type => ({
  _tag: "pkg-json-entry",
  path: "{{targetPath}}/package.json",
  field,
  name,
  value,
});
const sdkModule = (
  name: string,
  placement: string,
  contents: string,
  dependencies: (typeof ModuleDefinition.Type)["dependencies"] = [],
  entries: (typeof ModuleDefinition.Type)["contributions"] = [],
): typeof ModuleDefinition.Type => ({
  id: ModuleId.make(name),
  title: name,
  description: "Native Deno SDK peer fixture",
  supportedOn: [{ _tag: "identity", identity: packageIdentity(name) }],
  supportedRuntimes: ["deno"],
  targetPath: PackageTargetPath.make(placement),
  dependencies,
  contributions: [
    entry("exports", ".", "./src/peer.ts"),
    file("{{targetPath}}/src/peer.ts", contents),
    ...entries,
  ],
});

class OutputLimitError extends Schema.TaggedError<OutputLimitError>()(
  "OutputLimitError",
  { message: Schema.String },
) {}

// Check each stream's byte cap before concatenation; decode only complete UTF-8.
const collect = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  label: string,
) =>
  Stream.runFoldEffect(
    stream,
    () => Buffer.alloc(0),
    (buffer, chunk) =>
      buffer.byteLength + chunk.byteLength > 1024 * 1024
        ? Effect.fail(
            new OutputLimitError({ message: `${label} exceeded 1 MiB` }),
          )
        : Effect.succeed(Buffer.concat([buffer, chunk])),
  ).pipe(Effect.map((buffer) => buffer.toString("utf8")));

["flat", "nested"].forEach((layout) => {
  const clientPath =
    layout === "flat" ? "packages/sdk-client" : "packages/sdk/client";
  const codecsPath =
    layout === "flat" ? "packages/sdk-codecs" : "packages/sdk/codecs";
  const probe: typeof ModuleDefinition.Type = {
    id: ModuleId.make("workspace-deno-sdk-probe"),
    title: "Deno SDK probe",
    description: "Bare-import the composed SDK client",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    supportedRuntimes: ["deno"],
    dependencies: [],
    contributions: [
      file(
        "{{targetPath}}/placement-probe.ts",
        `
import { value, clientUrl, codecsUrl } from "@repo/sdk-client";
console.log(JSON.stringify({ value, clientUrl, codecsUrl,
  version: Deno.version.deno, pid: Deno.pid }));
`,
      ),
    ],
  };
  const modules: ReadonlyArray<typeof ModuleDefinition.Type> = [
    sdkModule(
      "sdk-codecs",
      codecsPath,
      `export const marker = "sdk-codecs";
export const codecsUrl = import.meta.url;
`,
    ),
    sdkModule(
      "sdk-client",
      clientPath,
      `import { marker, codecsUrl } from "@repo/sdk-codecs";
export { codecsUrl };
export const value = "sdk-client:" + marker;
export const clientUrl = import.meta.url;
`,
      [
        {
          _tag: "required-module",
          target: packageIdentity("sdk-codecs"),
          moduleId: ModuleId.make("sdk-codecs"),
        },
      ],
      [entry("dependencies", "@repo/sdk-codecs", "workspace:*")],
    ),
    probe,
  ];
  const catalogLayer = officialCatalogLayerWith([{ targets: [], modules }]);
  const services = Layer.mergeAll(
    BlueprintService.layer,
    ApplyWorkspaceService.layer,
  ).pipe(
    Layer.provideMerge(catalogLayer),
    Layer.provideMerge(NodeServices.layer),
  );

  // Live clock: the deadline must cover spawn, both pipe drains, and exit wait.
  it.live(`resolves Deno SDK peers at exact ${layout} physical URLs`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const catalog = yield* CatalogService;
      const resolver = yield* BlueprintService;
      const workspaces = yield* ApplyWorkspaceService;
      const config = new StackConfig({
        name: Schema.NonEmptyString.make("deno-control"),
        runtime: { _tag: "deno" },
      });
      const identity = new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: config.name,
      });
      const selection = Selection.make({
        targets: [
          { identity, modules: [{ id: probe.id }] },
          {
            identity: packageIdentity("sdk-client"),
            modules: [{ id: ModuleId.make("sdk-client") }],
          },
        ],
      });
      // Codecs is intentionally absent from Selection: Blueprint closes the dependency.
      const blueprint = yield* resolver.resolve(selection, config);
      const workspace = yield* workspaces.create();
      const plan = yield* workspace.plan({ blueprint, config });
      const materialized = yield* workspace.materialize(
        new Apply({ plan, decisions: [] }),
      );
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "stack-effect-deno-sdk-",
      });
      yield* Effect.forEach(materialized.files, (file) =>
        Effect.gen(function* () {
          const destination = path.join(root, file.path);
          assert.strictEqual(typeof file.contents, "string");
          yield* fs.makeDirectory(path.dirname(destination), {
            recursive: true,
          });
          yield* fs.writeFileString(destination, file.contents);
          assert.isTrue(yield* fs.exists(destination));
        }),
      );
      const manifest = (
        owner: TargetIdentity,
        placement: string,
        filename: string,
      ) =>
        Effect.gen(function* () {
          const context = new ContributionTokenContext({
            identity: owner,
            targetKey: owner.toKey(),
            targetPath:
              placement === "."
                ? owner.toPath()
                : PackageTargetPath.make(placement),
            config,
          });
          const definition = yield* catalog.getTarget(owner.kind);
          const contribution = definition.contributions.find(
            (entry) =>
              entry._tag === "file" && context.resolve(entry.path) === filename,
          );
          assert.isDefined(contribution);
          assert.strictEqual(contribution._tag, "file");
          const file = materialized.files.find(
            (entry) => entry.path === filename,
          );
          assert.isDefined(file);
          return yield* Schema.decodeEffect(manifestCodec)(file.contents);
        });
      const rootManifest = yield* manifest(identity, ".", "package.json");
      const denoManifest = yield* manifest(identity, ".", "deno.json");
      const sdk = yield* manifest(
        packageIdentity("sdk-client"),
        clientPath,
        `${clientPath}/package.json`,
      );
      assert.deepStrictEqual(rootManifest.workspaces, [
        "apps/*",
        "packages/**",
      ]);
      assert.deepStrictEqual(denoManifest.workspace, ["apps/*", "packages/*"]);
      assert.isUndefined(rootManifest.packageManager);
      assert.strictEqual(config.packageManagerName, "deno");
      assert.strictEqual(sdk.name, "@repo/sdk-client");
      assert.strictEqual(
        sdk.devDependencies?.["@repo/config-typescript"],
        "workspace:*",
      );
      [
        `${clientPath}/src/peer.ts`,
        `${codecsPath}/src/peer.ts`,
        "placement-probe.ts",
        `${codecsPath}/package.json`,
        "packages/config-typescript/package.json",
        "packages/config-typescript/base.json",
      ].forEach((filename) =>
        assert.isDefined(
          materialized.files.find((file) => file.path === filename),
        ),
      );

      // Scope/timeout do not prove descendant termination, reap, or bounded post-KILL wait.
      // Qualification still requires an external guardian and independent owned-group observations.
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const child = yield* spawner.spawn(
            ChildProcess.make(
              "deno",
              [
                "run",
                "--no-prompt",
                `--allow-read=${root}`,
                "placement-probe.ts",
              ],
              {
                cwd: root,
                shell: false,
                detached: false,
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
                killSignal: "SIGTERM",
                forceKillAfter: "5 seconds",
              },
            ),
          );
          const output = yield* Effect.all(
            {
              stdout: collect(child.stdout, "stdout"),
              stderr: collect(child.stderr, "stderr"),
              exitCode: child.exitCode,
            },
            { concurrency: "unbounded" },
          );
          return { ...output, pid: child.pid };
        }),
      ).pipe(Effect.timeout("60 seconds"));
      assert.strictEqual(result.exitCode, 0, result.stderr);
      const observed = yield* Schema.decodeEffect(probeCodec)(result.stdout);
      assert.strictEqual(observed.value, "sdk-client:sdk-codecs");
      assert.strictEqual(
        observed.clientUrl,
        pathToFileURL(path.join(root, clientPath, "src/peer.ts")).href,
      );
      assert.strictEqual(
        observed.codecsUrl,
        pathToFileURL(path.join(root, codecsPath, "src/peer.ts")).href,
      );
      assert.isAbove(observed.version.length, 0);
      assert.isTrue(Number.isInteger(observed.pid));
      assert.isAbove(observed.pid, 0);
      assert.strictEqual(observed.pid, result.pid);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );
});
