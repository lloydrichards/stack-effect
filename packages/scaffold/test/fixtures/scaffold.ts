import { FileSystemTesting, MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { CatalogService } from "@repo/catalog";
import { Apply, type ApplyDecision } from "@repo/domain/Apply";
import {
  CatalogDocument,
  type CatalogFragment,
  type Contribution,
  type ModuleDefinition,
  ModuleId,
  type TargetDefinition,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { CatalogSources } from "@repo/domain/CatalogSource";
import { type Plan, RepositoryPath } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { ApplyService } from "@repo/scaffold/ApplyService";
import { ApplyWorkspaces } from "@repo/scaffold/ApplyWorkspaces";
import { BlueprintService } from "@repo/scaffold/BlueprintService";
import { CatalogCache } from "@repo/scaffold/CatalogCache";
import { CatalogLoader } from "@repo/scaffold/CatalogLoader";
import { PlanService } from "@repo/scaffold/PlanService";
import {
  Effect,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Ref,
  Schema,
} from "effect";
import {
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/http";

/** Shared scaffold test platform, catalogs, pipeline, and fault injection. */

// Platform

/** The platform Recipe Builder provides: a memory filesystem, POSIX paths, and Web Crypto. */
export const platform = Layer.merge(
  Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
  Path.layer,
);

export const repositoryRoot = "/repo";

export const config = new StackConfig({
  name: "test-project",
  runtime: { _tag: "bun" },
});

// Catalog definitions

export const target = (
  kind: string,
  extra: Partial<TargetDefinition> = {},
): TargetDefinition => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [],
  ...extra,
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
  contributions: [],
  ...extra,
});

const packageModule = (
  id: string,
  ...contributions: ReadonlyArray<Contribution>
) => module(id, "package", { contributions });

/** Adds `input` to the `Options` struct in `src/Options.ts`. */
const optionsField = (id: string, value: string) =>
  packageModule(id, {
    _tag: "ts-object-field",
    path: "{{targetPath}}/src/Options.ts",
    targetVariable: "Options",
    functionName: "Schema.Struct",
    field: "input",
    value,
  });

/** A struct nested twelve levels deep around `leaf`. */
export const nestedStruct = (leaf: string): string =>
  Array.from({ length: 12 }).reduce<string>(
    (value) => `Schema.Struct({ child: ${value} })`,
    leaf,
  );

/**
 * A catalog with one package module per contribution kind, so each test
 * selects exactly the files it exercises. Package targets live under
 * `packages/<name>`; the workspace target writes to the repository root.
 */
export const testCatalog = {
  targets: [
    target("package"),
    target("workspace", {
      contributions: [
        {
          _tag: "file",
          path: "deno.json",
          contents: '{"workspace":[],"custom":"new"}',
          conflictOnModify: true,
        },
        {
          _tag: "file",
          path: "pnpm-workspace.yaml",
          contents: "packages: []\nsetting: new\n",
          conflictOnModify: true,
        },
      ],
    }),
  ],
  modules: [
    module("root-scripts", "workspace", {
      contributions: [
        {
          _tag: "pkg-json-entry",
          path: "package.json",
          field: "scripts",
          name: "dev",
          value: "vite",
        },
      ],
    }),
    packageModule(
      "pair",
      { _tag: "file", path: "{{targetPath}}/src/a.txt", contents: "A\n" },
      { _tag: "file", path: "{{targetPath}}/src/b.txt", contents: "B\n" },
    ),
    packageModule("template-manifest", {
      _tag: "file",
      path: "{{targetPath}}/templates/package.json",
      contents: "{}\n",
    }),
    packageModule("tsconfig", {
      _tag: "file",
      path: "{{targetPath}}/tsconfig.json",
      contents: '{ "extends": "../../tsconfig.base.json" }\n',
      conflictOnModify: true,
    }),
    packageModule(
      "api",
      {
        _tag: "file",
        path: "{{targetPath}}/src/Api.ts",
        contents: "export const Api = {};\n",
      },
      {
        _tag: "barrel-export",
        barrelPath: "{{targetPath}}/src/index.ts",
        exportPath: "./Api",
      },
    ),
    // Adds a script to an existing manifest; plan it beside a named package.json.
    packageModule("scripts", {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "scripts",
      name: "dev",
      value: "vite",
    }),
    // A script whose name is also Object.prototype's accessor.
    packageModule("proto-script", {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "scripts",
      name: "__proto__",
      value: "node proto.js",
    }),
    packageModule(
      "manifest",
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: '{ "name": "{{packageName}}" }\n',
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "vite",
      },
    ),
    packageModule("command", {
      _tag: "ts-call-arg",
      path: "{{targetPath}}/src/main.ts",
      targetVariable: "program",
      functionName: "Command.withSubcommands",
      argument: "apiCommand",
      import: { moduleSpecifier: "./api", namedImports: ["apiCommand"] },
    }),
    packageModule("card-slot", {
      _tag: "jsx-slot",
      path: "{{targetPath}}/src/App.tsx",
      slotId: "components",
      content: "<Card />",
    }),
    packageModule("app-shell", {
      _tag: "file",
      path: "{{targetPath}}/src/App.tsx",
      contents: "export const App = () => <>\n{/* @slot:components */}\n</>;\n",
    }),
    packageModule("first-card-slot", {
      _tag: "jsx-slot",
      path: "{{targetPath}}/src/App.tsx",
      slotId: "first",
      content: "<Card />",
    }),
    packageModule("alpha-slot", {
      _tag: "jsx-slot",
      path: "{{targetPath}}/src/App.tsx",
      slotId: "components",
      content: "<Alpha />",
      import: { moduleSpecifier: "./cards", namedImports: ["Alpha", "Beta"] },
    }),
    packageModule("beta-slot", {
      _tag: "jsx-slot",
      path: "{{targetPath}}/src/App.tsx",
      slotId: "components",
      content: "<Beta />",
      import: { moduleSpecifier: "./cards", namedImports: ["Alpha", "Beta"] },
    }),
    optionsField("options-field", "Schema.Number"),
    optionsField("nested-string-field", nestedStruct("Schema.String")),
    optionsField("nested-number-field", nestedStruct("Schema.Number")),
    packageModule(
      "deno-dev",
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: '{ "name": "{{packageName}}" }\n',
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value:
          "deno run --allow-env --allow-net --allow-read --allow-write src/index.ts",
      },
    ),
    packageModule("db-dependency", {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "dependencies",
      name: "@repo/db",
      value: "workspace:*",
    }),
  ],
} satisfies CatalogFragment;

export const TestCatalogLayer = CatalogService.fromFragments([testCatalog]);

// Selections

/** One selected target with its modules, such as `selected("package", "app", "api")`. */
export const selected = (
  kind: string,
  name: string,
  ...modules: ReadonlyArray<string>
): Selection["targets"][number] => ({
  identity: new TargetIdentity({ kind: TargetKind.make(kind), name }),
  modules: modules.map((id) => ({ id: ModuleId.make(id) })),
});

export const selection = (
  ...targets: ReadonlyArray<Selection["targets"][number]>
): Selection => ({ targets });

/** A package named `app` with the given test catalog modules. */
export const app = (...modules: ReadonlyArray<string>) =>
  selection(selected("package", "app", ...modules));

// Pipeline

/** Plan, Apply, and preview services over the platform and a catalog. */
export const pipelineLayer = <E>(catalog: Layer.Layer<CatalogService, E>) =>
  Layer.provideMerge(
    Layer.mergeAll(
      BlueprintService.layer,
      PlanService.layer,
      ApplyService.layer,
      ApplyWorkspaces.layer,
    ),
    Layer.mergeAll(platform, catalog),
  );

/** The pipeline over the test catalog. */
export const testPipeline = pipelineLayer(TestCatalogLayer);

/** Resolves a selection and plans it against a repository. */
export const plan = (
  input: Selection,
  options: {
    readonly repositoryRoot?: string;
    readonly config?: StackConfig;
  } = {},
) =>
  Effect.gen(function* () {
    const blueprints = yield* BlueprintService;
    const plans = yield* PlanService;
    const stackConfig = options.config ?? config;
    const blueprint = yield* blueprints.resolve(input, stackConfig);
    return yield* plans.build({
      blueprint,
      config: stackConfig,
      repositoryRoot: options.repositoryRoot ?? repositoryRoot,
    });
  });

/** Applies a Plan with the given decisions. */
export const apply = (
  planned: Plan,
  decisions: ReadonlyArray<ApplyDecision> = [],
  root = repositoryRoot,
) =>
  Effect.gen(function* () {
    const service = yield* ApplyService;
    return yield* service.apply({
      apply: new Apply({ plan: planned, decisions }),
      repositoryRoot: root,
    });
  });

/** One decision for every conflicted path in a Plan. */
export const decideAll = (
  planned: Plan,
  value: ApplyDecision["value"],
): ReadonlyArray<ApplyDecision> =>
  planned.outcomes
    .filter((outcome) => outcome.classification === "conflict")
    .map((outcome) => ({ path: outcome.path, value }));

/** Previews an Apply the way the CLI dry run does: seed from its baseline, then materialize. */
export const preview = (
  planned: Plan,
  decisions: ReadonlyArray<ApplyDecision> = [],
  root = repositoryRoot,
) =>
  Effect.gen(function* () {
    const workspaces = yield* ApplyWorkspaces;
    const workspace = yield* workspaces.fromRepository({
      repositoryRoot: root,
      baseline: planned.baseline,
    });
    return yield* workspace.materialize(
      new Apply({ plan: planned, decisions }),
    );
  });

// Repository files

/** Writes files relative to the repository root, creating parent directories. */
export const writeFiles = (
  files: Readonly<Record<string, string>>,
  root = repositoryRoot,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(root, { recursive: true });
    yield* Effect.forEach(
      Object.entries(files),
      ([path, contents]) => {
        const absolute = `${root}/${path}`;
        return fileSystem
          .makeDirectory(absolute.slice(0, absolute.lastIndexOf("/")), {
            recursive: true,
          })
          .pipe(Effect.andThen(fileSystem.writeFileString(absolute, contents)));
      },
      { discard: true },
    );
  });

/** Repository paths, as Plan and Apply results report them. */
export const paths = (...values: ReadonlyArray<string>) =>
  values.map((value) => RepositoryPath.make(value));

export const readFile = (path: string, root = repositoryRoot) =>
  Effect.flatMap(FileSystem.FileSystem, (fileSystem) =>
    fileSystem.readFileString(`${root}/${path}`),
  );

export const exists = (path: string, root = repositoryRoot) =>
  Effect.flatMap(FileSystem.FileSystem, (fileSystem) =>
    fileSystem.exists(`${root}/${path}`),
  );

// Fault injection

/**
 * A FileSystem call to intercept, matched on its method and the absolute path
 * it names (the destination, for `rename`). It fires once, on the first
 * matching call after `skip`. By default the call fails; `before` instead
 * runs an effect and then lets the call proceed.
 */
export type Fault = {
  readonly method: "lstat" | "readFile" | "rename";
  readonly path: string;
  readonly before?: Effect.Effect<void, PlatformError.PlatformError>;
  /** Matching calls to let through before the fault fires. */
  readonly skip?: number;
};

/**
 * Wraps the current FileSystem with a fault and returns a `provide` that runs
 * an effect against Plan, Apply, and preview services built over it, plus a
 * flag recording whether the fault fired.
 */
export const withFault = Effect.fnUntraced(function* (fault: Fault) {
  const base = yield* FileSystem.FileSystem;
  const catalog = yield* CatalogService;
  const { fileSystem, state: fired } = yield* FileSystemTesting.make(
    base,
    Effect.fnUntraced(function* () {
      const fired = yield* Ref.make(false);
      const matches = yield* Ref.make(0);
      const intercept = (path: string) =>
        path !== fault.path
          ? Effect.void
          : Ref.updateAndGet(matches, (count) => count + 1).pipe(
              Effect.flatMap((count) =>
                count !== (fault.skip ?? 0) + 1
                  ? Effect.void
                  : Ref.set(fired, true).pipe(
                      Effect.andThen(
                        fault.before ??
                          Effect.fail(
                            PlatformError.systemError({
                              _tag: "Unknown",
                              module: "FileSystem",
                              method: fault.method,
                              description: "injected fault",
                              pathOrDescriptor: path,
                            }),
                          ),
                      ),
                    ),
              ),
            );
      const handlers: FileSystemTesting.Handlers =
        fault.method === "rename"
          ? { rename: (_from, to) => intercept(to) }
          : { [fault.method]: intercept };
      return { state: fired, handlers };
    }),
  );
  // Fresh services, so none built over the unwrapped FileSystem is reused.
  const faulted = Layer.provide(
    Layer.mergeAll(
      Layer.fresh(BlueprintService.layer),
      Layer.fresh(PlanService.layer),
      Layer.fresh(ApplyService.layer),
      Layer.fresh(ApplyWorkspaces.layer),
    ),
    Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Path.layer,
      BrowserCrypto.layer,
      Layer.succeed(CatalogService, catalog),
    ),
  );
  return {
    fired: Ref.get(fired),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, faulted),
  };
});

// Catalog sources

export const officialUrl = "https://stack-effect.test/registry/v1/catalog.json";

export const urls = {
  ext: "https://ext.test/v1.json",
  acme: "https://acme.test/v1.json",
  beta: "https://beta.test/v1.json",
} as const;

/** Encodes a v1 catalog document as the JSON a source would serve. */
export const json = (
  catalogId: string,
  fragment: {
    readonly targets?: ReadonlyArray<TargetDefinition>;
    readonly modules?: ReadonlyArray<ModuleDefinition>;
    readonly requires?: ReadonlyArray<"official">;
  },
) =>
  Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make(catalogId),
    requiredCapabilities: [],
    targets: fragment.targets ?? [],
    modules: fragment.modules ?? [],
    ...(fragment.requires ? { requires: fragment.requires } : {}),
  });

/** A route answers with a JSON body, or with an empty response of that status. */
export type Route = string | number;

/**
 * A loader whose HTTP client answers each URL from `routes` (404 otherwise)
 * and records every requested URL.
 */
export const routedLayer = (routes: Record<string, () => Route>) => {
  const requested: Array<string> = [];
  const respond = (request: HttpClientRequest.HttpClientRequest) => {
    requested.push(request.url);
    const route = routes[request.url]?.() ?? 404;
    return HttpClientResponse.fromWeb(
      request,
      typeof route === "number"
        ? new Response(null, { status: route })
        : new Response(route, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
    );
  };
  const layer = CatalogLoader.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => Effect.sync(() => respond(request))),
        ),
        CatalogCache.layerMemory,
        BrowserCrypto.layer,
      ),
    ),
  );
  return { layer, requested };
};

type SelectedSource =
  | "official"
  | keyof typeof urls
  | { readonly name: string; readonly url: string };

/** Decodes a selection from named fixtures or explicit `{ name, url }` entries. */
export const select = (
  ...entries: ReadonlyArray<SelectedSource>
): CatalogSources =>
  Schema.decodeUnknownSync(CatalogSources)(
    entries.map((entry) =>
      typeof entry !== "string"
        ? entry
        : entry === "official"
          ? { name: entry }
          : { name: entry, url: urls[entry] },
    ),
  );

export const loadSources = (sources: CatalogSources) =>
  Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    return yield* loader.loadSources({ sources, officialUrl });
  });
