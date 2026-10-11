// Qualify the local catalog's library tarball in consumers outside this repository.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { Apply } from "@repo/domain/Apply";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { ApplyService, BlueprintService, PlanService } from "@repo/scaffold";
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
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

class VerificationFailure extends Data.TaggedError("VerificationFailure")<{
  readonly message: string;
}> {}

const requireThat = (condition: boolean, message: string) =>
  condition ? Effect.void : Effect.fail(new VerificationFailure({ message }));

const run = (cwd: string, command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, stdout: "pipe", stderr: "pipe" }),
    );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: "unbounded" },
    );
    yield* requireThat(
      exitCode === 0,
      `${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`,
    );
    return stdout;
  }).pipe(Effect.scoped);

const Packed = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      filename: Schema.String,
      files: Schema.Array(Schema.Struct({ path: Schema.String })),
    }),
  ),
);

const verify = (runtime: "bun" | "node") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const blueprintService = yield* BlueprintService;
    const planService = yield* PlanService;
    const applyService = yield* ApplyService;
    const root = yield* fs.makeTempDirectoryScoped({
      prefix: `stack-library-${runtime}-`,
    });
    const project = path.join(root, "project");
    yield* fs.makeDirectory(project);
    const config = new StackConfig({
      name: "library-proof",
      runtime:
        runtime === "bun"
          ? { _tag: "bun" }
          : { _tag: "node", packageManager: "npm" },
      typescript: "7",
    });
    const blueprint = yield* blueprintService.resolve(
      {
        targets: [
          {
            identity: new TargetIdentity({
              kind: TargetKind.make("workspace"),
              name: "root",
            }),
            modules: [{ id: ModuleId.make("workspace-typescript-7") }],
          },
          {
            identity: new TargetIdentity({
              kind: TargetKind.make("package"),
              name: "sdk",
            }),
            modules: [{ id: ModuleId.make("package-library") }],
          },
        ],
      },
      config,
    );
    const plan = yield* planService.build({
      blueprint,
      config,
      repoRoot: project,
    });
    yield* requireThat(
      plan.conflicts.length === 0,
      "Fresh library must not require Apply decisions",
    );
    const applied = yield* applyService.apply({
      apply: new Apply({ plan, decisions: [] }),
      repoRoot: project,
    });
    yield* requireThat(applied.failed.length === 0, "Library Apply failed");
    yield* run(project, runtime === "bun" ? "bun" : "npm", [
      "install",
      "--ignore-scripts",
    ]);

    const library = path.join(project, "packages/sdk");
    yield* fs.writeFileString(
      path.join(library, "src/index.ts"),
      'export { answer } from "./Answer.js";\n',
    );
    yield* fs.writeFileString(
      path.join(library, "src/Answer.ts"),
      'import { Effect } from "effect";\nexport const answer: Effect.Effect<number> = Effect.succeed(42);\n',
    );
    yield* fs.writeFileString(
      path.join(library, "src/Obsolete.ts"),
      "export const obsolete = true;\n",
    );
    yield* run(library, "npm", ["run", "build"]);
    yield* requireThat(
      yield* fs.exists(path.join(library, "dist/Obsolete.js")),
      "Build must emit the source file before the cleanup check",
    );
    yield* fs.remove(path.join(library, "src/Obsolete.ts"));
    const packed = yield* Schema.decodeEffect(Packed)(
      yield* run(library, "npm", [
        "--silent",
        "run",
        "pack",
        "--",
        "--json",
        "--pack-destination",
        root,
      ]),
    );
    const archive = packed[0];
    if (archive === undefined)
      return yield* new VerificationFailure({
        message: "npm pack did not return an archive",
      });
    const files = archive.files.map((file) => file.path);
    yield* requireThat(
      ["index.js", "index.d.ts", "Answer.js", "Answer.d.ts"].every((file) =>
        files.includes(file),
      ),
      "Tarball is missing public JavaScript or declarations",
    );
    yield* requireThat(
      files.every(
        (file) =>
          ["package.json", "README.md", "LICENSE"].includes(file) ||
          ((file.endsWith(".js") || file.endsWith(".d.ts")) &&
            !file.includes("Obsolete") &&
            !file.endsWith(".map")),
      ),
      "Tarball contains stale or development files",
    );

    const consumer = path.join(root, "consumer");
    yield* fs.makeDirectory(consumer);
    yield* fs.writeFileString(
      path.join(consumer, "package.json"),
      json({
        name: "library-consumer",
        private: true,
        type: "module",
      }),
    );
    yield* run(consumer, "npm", [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(root, archive.filename),
      "typescript@6.0.3",
    ]);
    yield* fs.writeFileString(
      path.join(consumer, "index.mjs"),
      `import { answer } from "@repo/sdk";
import { Effect } from "effect";
if (Effect.runSync(answer) !== 42) throw new Error("Library returned the wrong value");
try {
  await import("@repo/sdk/Answer");
  throw new Error("Unlisted subpath was exposed");
} catch (error) {
  if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
}
`,
    );
    yield* run(consumer, "node", ["index.mjs"]);
    yield* fs.writeFileString(
      path.join(consumer, "index.ts"),
      'import { answer } from "@repo/sdk";\nimport { Effect } from "effect";\nconst typed: Effect.Effect<number> = answer;\nconst result: number = Effect.runSync(typed);\nvoid result;\n',
    );
    yield* run(consumer, "npm", [
      "exec",
      "--",
      "tsc",
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--lib",
      "ES2023,ESNext.Disposable,DOM,DOM.Iterable",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "index.ts",
    ]);
    yield* run(consumer, "npm", [
      "exec",
      "--",
      "tsc",
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--lib",
      "ES2023,ESNext.Disposable,DOM,DOM.Iterable",
      "--module",
      "ESNext",
      "--moduleResolution",
      "bundler",
      "index.ts",
    ]);
    yield* Console.log(
      `${runtime}: tarball import, NodeNext and bundler declarations, private subpaths, and stale-output cleanup passed`,
    );
  }).pipe(Effect.scoped);

const Services = Layer.mergeAll(
  BlueprintService.layer,
  PlanService.layer,
  ApplyService.layer,
).pipe(Layer.provide(OfficialCatalogLayer), Layer.provide(NodeServices.layer));

NodeRuntime.runMain(
  Effect.gen(function* () {
    yield* verify("bun");
    yield* verify("node");
  }).pipe(Effect.provide(Layer.mergeAll(Services, NodeServices.layer))),
);
