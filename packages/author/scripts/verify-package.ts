// Proves the package installs and builds a catalog in a clean project with
// no links into this repository. Pass `--registry <version>` to verify the
// published version instead of a freshly packed tarball.
// @effect-diagnostics nodeBuiltinImport:off

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Array as Arr,
  Console,
  Data,
  Effect,
  FileSystem,
  Path,
  Schema,
  Stream,
} from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

class VerifyError extends Data.TaggedError("VerifyError")<{
  readonly message: string;
}> {}

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    peerDependencies: Schema.Struct({ effect: Schema.String }),
  }),
);

const Packed = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      version: Schema.String,
      filename: Schema.String,
      files: Schema.Array(Schema.Struct({ path: Schema.String })),
    }),
  ),
);

const JsonFile = Schema.fromJsonString(Schema.Unknown, { space: 2 });

const shipped = (path: string) =>
  ["package.json", "README.md", "LICENSE"].includes(path) ||
  path.startsWith("dist/");

/** `--registry <version>`, rejecting a missing or empty version. */
const registryVersion = Effect.gen(function* () {
  const args = process.argv.slice(2);
  const at = args.indexOf("--registry");
  if (at === -1) return undefined;
  const version = args[at + 1];
  if (version === undefined || version === "" || version.startsWith("-"))
    return yield* new VerifyError({
      message: "--registry needs a version, for example --registry 0.1.0",
    });
  return version;
});

const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
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
    if (exitCode !== 0)
      return yield* new VerifyError({
        message: `${command} ${args.join(" ")} exited with ${exitCode}\n${stdout}\n${stderr}`,
      });
    return stdout;
  }).pipe(Effect.scoped);

const buildScript = (
  name: string,
) => `import { NodeServices } from "@effect/platform-node";
import { buildCatalog, type CatalogInput, defineModules, templates } from "${name}";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { catalog, root } from "./catalog/catalog.ts";

const build = (input: CatalogInput) =>
  Effect.runPromise(
    buildCatalog(input, { catalogId: "acme", root }).pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false as const, error }),
        onSuccess: (result) => ({ ok: true as const, result }),
      }),
      Effect.provide(NodeServices.layer),
    ),
  );

const built = await build(catalog);
if (!built.ok) throw new Error(built.error.message);
const golden = readFileSync(new URL("./catalog/golden/catalog.json", import.meta.url), "utf8");
if (built.result.json !== golden) throw new Error("Built catalog differs from the golden document");

// A definition whose template is missing must fail with a located issue.
const template = templates(new URL("./catalog/templates/", import.meta.url));
const broken = defineModules(new URL("./catalog/broken.ts", import.meta.url), [
  {
    id: "acme-broken",
    title: "Broken",
    description: "Refers to a missing template",
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [],
    contributions: [{ _tag: "file", path: "broken.txt", contents: template("./missing.txt") }],
  },
]);
const failed = await build({ ...catalog, modules: [...catalog.modules, broken] });
if (failed.ok || !failed.error.issues.some((issue) => issue.code === "missing-template"))
  throw new Error("A missing template was not reported");
console.log(failed.error.issues.map((issue) => issue.message).join("; "));
`;

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packageDir = path.join(import.meta.dirname, "..");
  const fixtureDir = path.join(
    packageDir,
    "../authoring/test/fixtures/standalone",
  );
  const { name, peerDependencies } = yield* Schema.decodeEffect(Manifest)(
    yield* fs.readFileString(path.join(packageDir, "package.json")),
  );
  const effectVersion = peerDependencies.effect;
  const version = yield* registryVersion;
  const project = yield* fs.makeTempDirectoryScoped({
    prefix: "stack-effect-author-",
  });

  // Pack either this checkout or the published version, then check exactly
  // what the tarball ships before installing it.
  if (version === undefined) yield* run("bun", ["run", "build"], packageDir);
  const [packed] = yield* Schema.decodeEffect(Packed)(
    yield* run(
      "npm",
      [
        "pack",
        version === undefined ? "." : `${name}@${version}`,
        "--json",
        "--pack-destination",
        project,
      ],
      packageDir,
    ),
  );
  if (packed === undefined)
    return yield* new VerifyError({ message: "npm pack produced nothing" });
  if (version !== undefined && packed.version !== version)
    return yield* new VerifyError({
      message: `Expected ${name}@${version}, packed ${packed.version}`,
    });
  const unexpected = packed.files
    .map((file) => file.path)
    .filter((file) => !shipped(file));
  if (Arr.isArrayNonEmpty(unexpected))
    return yield* new VerifyError({
      message: `Tarball ships unexpected files: ${unexpected.join(", ")}`,
    });

  // The standalone fixture, importing the package the way an author would.
  const catalogDir = path.join(project, "catalog");
  yield* fs.copy(fixtureDir, catalogDir);
  const sources = (yield* fs.readDirectory(catalogDir)).filter((file) =>
    file.endsWith(".ts"),
  );
  yield* Effect.forEach(sources, (file) =>
    Effect.gen(function* () {
      const source = path.join(catalogDir, file);
      yield* fs.writeFileString(
        source,
        (yield* fs.readFileString(source))
          .replaceAll('"@repo/authoring"', `"${name}"`)
          .replace(/from "\.\/(\w+)"/g, 'from "./$1.ts"'),
      );
    }),
  );

  yield* fs.writeFileString(path.join(project, "build.ts"), buildScript(name));
  const writeJson = (file: string, value: unknown) =>
    Schema.encodeEffect(JsonFile)(value).pipe(
      Effect.flatMap((json) =>
        fs.writeFileString(path.join(project, file), json),
      ),
    );
  yield* writeJson("package.json", {
    name: "author-smoke",
    private: true,
    type: "module",
    dependencies: {
      [name]: `file:./${packed.filename}`,
      "@effect/platform-node": effectVersion,
      effect: effectVersion,
    },
    devDependencies: { "@types/node": "^24", typescript: "~5.9.3" },
    // Effect RCs are not mutually compatible; keep platform packages on the peer.
    overrides: { "@effect/platform-node-shared": effectVersion },
  });
  yield* writeJson("tsconfig.json", {
    compilerOptions: {
      target: "es2022",
      module: "nodenext",
      moduleResolution: "nodenext",
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: false,
      types: ["node"],
    },
    include: ["build.ts", "catalog/*.ts"],
  });

  yield* run("npm", ["install", "--no-audit", "--no-fund"], project);
  yield* run("npx", ["tsc", "-p", "."], project);
  const output = yield* run("node", ["build.ts"], project);
  yield* Console.log(`${name}@${packed.version}: ${output.trim()}`);
});

NodeRuntime.runMain(
  program.pipe(
    Effect.scoped,
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(NodeServices.layer),
  ),
  { disableErrorReporting: true },
);
