import { assert, it } from "@effect/vitest";
import { Blueprint } from "@repo/domain/Blueprint";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import { ModuleId } from "@repo/domain/Catalog";
import {
  CatalogSources,
  defaultCatalogSources,
} from "@repo/domain/CatalogSource";
import { STACK_CONFIG_SCHEMA_URL, StackConfig } from "@repo/domain/Scaffold";
import {
  ApplyPreviewFileSchema,
  RecipePreviewInput,
} from "@repo/scaffold/recipe-preview";
import { Cause, Effect, Exit, Option, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { AtomRegistry } from "effect/unstable/reactivity";
import {
  catalogAtom,
  previewAtom,
  type PreviewAtomRequest,
} from "../../app/atom/recipe-builder-atom";
import { toRecipePreviewInput } from "../../app/components/recipe-builder/form";
import { RecipeBuilderRpcFailure } from "../../app/workers/recipe-builder/domain";
import { fullStackRecipeFixture } from "../components/recipe-builder/recipe-fixtures";
import { registryParityCases } from "../fixtures/registry-parity";

const CliParityResult = Schema.Struct({
  blueprint: Blueprint,
  files: Schema.Array(ApplyPreviewFileSchema),
});

const runAtom = <Arg, A, E>(
  atom: import("effect/unstable/reactivity").Atom.AtomResultFn<Arg, A, E>,
  argument: Arg,
) =>
  Effect.gen(function* () {
    const registry = AtomRegistry.make();
    const unmount = registry.mount(atom);
    yield* Effect.addFinalizer(() => Effect.sync(unmount));
    registry.set(atom, argument);
    return yield* AtomRegistry.getResult(registry, atom, {
      suspendOnWaiting: true,
    });
  }).pipe(Effect.scoped);

const catalogSource = () =>
  new URL("/registry/v1/catalog.json", window.location.origin).toString();

const customSource = (name: string, query = "") => ({
  name,
  url: new URL(
    `/registry-test/custom/${name}.json${query}`,
    window.location.origin,
  ).toString(),
});

const sourcesOf = (...entries: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownSync(CatalogSources)(entries);

const official = { name: "official" };

const setCustomOutage = (name: string, outage: boolean) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    yield* client.get(
      `${window.location.origin}/registry-test/custom-mode?name=${name}&value=${outage ? "outage" : "current"}`,
    );
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);

const rpcFailure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit)
    ? Cause.findErrorOption(exit.cause).pipe(
        Option.filter(Schema.is(RecipeBuilderRpcFailure)),
        Option.getOrUndefined,
      )
    : undefined;

const customOnlyInput = (
  name: string,
  catalogs: CatalogSources,
  targets: RecipePreviewInput["recipe"]["targets"],
): RecipePreviewInput => ({
  config: new StackConfig({
    $schema: STACK_CONFIG_SCHEMA_URL,
    name,
    runtime: { _tag: "bun" },
    catalogs,
  }),
  recipe: { targets },
});

const setRegistryMode = (mode: "current" | "outage" | "invalid" | "revised") =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    yield* client.get(
      `${window.location.origin}/registry-test/mode?value=${mode}`,
    );
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);

const cliParity = (
  input: RecipePreviewInput,
  command: string,
  addTarget?: string,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const body = yield* Schema.encodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          input: RecipePreviewInput,
          command: Schema.String,
          addTarget: Schema.optional(Schema.String),
        }),
      ),
    )({ input, command, ...(addTarget === undefined ? {} : { addTarget }) });
    const response = yield* client.execute(
      HttpClientRequest.post(
        `${window.location.origin}/registry-test/cli-parity`,
      ).pipe(HttpClientRequest.bodyText(body, "application/json")),
    );
    assert.strictEqual(response.status, 200);
    return yield* Schema.decodeEffect(Schema.fromJsonString(CliParityResult))(
      yield* response.text,
    );
  }).pipe(Effect.provide(FetchHttpClient.layer));

const makeSession = Effect.gen(function* () {
  const registry = AtomRegistry.make();
  const stopCatalog = registry.mount(catalogAtom);
  const stopPreview = registry.mount(previewAtom);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      stopPreview();
      stopCatalog();
    }),
  );
  return {
    catalog: (
      sessionId = 1,
      sources: CatalogSources = defaultCatalogSources,
      officialUrl = catalogSource(),
    ) => {
      registry.set(catalogAtom, {
        sessionId,
        sources,
        officialUrl,
        targetIdentityKey: "fixture",
        targets: [],
      });
      return AtomRegistry.getResult(registry, catalogAtom, {
        suspendOnWaiting: true,
      });
    },
    preview: (request: PreviewAtomRequest) => {
      registry.set(previewAtom, request);
      return AtomRegistry.getResult(registry, previewAtom, {
        suspendOnWaiting: true,
      });
    },
  };
});

for (const [name, input] of Object.entries(registryParityCases)) {
  it.live(`matches CLI Blueprint and files for ${name}`, () =>
    Effect.gen(function* () {
      yield* setRegistryMode("current");
      const session = yield* makeSession;
      yield* session.catalog();
      const browser = yield* session.preview({
        sessionId: 1,
        targetIdentityKey: name,
        input,
      });
      const cli = yield* cliParity(input, browser.preview.command);
      assert.deepEqual(browser.preview.blueprint, cli.blueprint);
      assert.deepEqual(browser.preview.files, cli.files);
    }).pipe(Effect.scoped),
  );
}

it.live("matches browser files after CLI create and incremental add", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    const session = yield* makeSession;
    yield* session.catalog(10);
    const base = yield* session.preview({
      sessionId: 10,
      targetIdentityKey: "base",
      input: registryParityCases.bun,
    });
    const input = toRecipePreviewInput({
      ...fullStackRecipeFixture,
      gitEnabled: false,
      targets: [
        ...fullStackRecipeFixture.targets,
        { id: "utility", kind: "package", name: "util", modules: [] },
      ],
    });
    const browser = yield* session.preview({
      sessionId: 10,
      targetIdentityKey: "with-util",
      input,
    });
    const cli = yield* cliParity(input, base.preview.command, "package/util");
    assert.deepEqual(browser.preview.blueprint, cli.blueprint);
    const addedFiles = (files: typeof cli.files) =>
      files.filter((file) => file.path.startsWith("packages/util/"));
    assert.isAbove(addedFiles(cli.files).length, 0);
    assert.deepEqual(addedFiles(browser.preview.files), addedFiles(cli.files));
  }).pipe(Effect.scoped),
);

it.live("uses a persisted catalog after reload during an outage", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    yield* Effect.addFinalizer(() => setRegistryMode("current"));
    yield* Effect.gen(function* () {
      const session = yield* makeSession;
      assert.strictEqual(
        (yield* session.catalog(20)).catalog.sources[0]?.freshness,
        "current",
      );
    }).pipe(Effect.scoped);
    yield* setRegistryMode("outage");
    const reloaded = yield* makeSession;
    const [official] = (yield* reloaded.catalog(21)).catalog.sources;
    assert.strictEqual(official?.name, "official");
    assert.strictEqual(official?.freshness, "cached");
    assert.strictEqual(official?.warning?.kind, "stale");
    assert.strictEqual(official?.warning?.sourceUrl, catalogSource());
  }).pipe(Effect.scoped),
);

it.live(
  "rejects invalid current content and an outage without cached data",
  () =>
    Effect.gen(function* () {
      yield* setRegistryMode("current");
      yield* Effect.addFinalizer(() => setRegistryMode("current"));
      const seed = yield* makeSession;
      yield* seed.catalog(30);
      yield* setRegistryMode("invalid");
      assert.isTrue(Exit.isFailure(yield* Effect.exit(seed.catalog(31))));
      yield* setRegistryMode("outage");
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            seed.catalog(
              32,
              defaultCatalogSources,
              `${catalogSource()}?cold=32`,
            ),
          ),
        ),
      );
    }).pipe(Effect.scoped),
);

it.live("keeps a session usable after its first request is superseded", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    const registry = AtomRegistry.make();
    const stop = registry.mount(catalogAtom);
    yield* Effect.addFinalizer(() => Effect.sync(stop));
    const request = {
      sessionId: 45,
      sources: defaultCatalogSources,
      officialUrl: `${catalogSource()}?superseded=45`,
      targets: [],
    };
    // React StrictMode repeats effects, so the same session is requested twice.
    registry.set(catalogAtom, { ...request, targetIdentityKey: "first" });
    registry.set(catalogAtom, { ...request, targetIdentityKey: "second" });
    const result = yield* AtomRegistry.getResult(registry, catalogAtom, {
      suspendOnWaiting: true,
    });
    assert.strictEqual(result.catalog.sources[0]?.freshness, "current");
  }).pipe(Effect.scoped),
);

it.live("rejects previews from a replaced catalog session", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    const session = yield* makeSession;
    yield* session.catalog(40);
    yield* session.catalog(41);
    const old = yield* Effect.exit(
      session.preview({
        sessionId: 40,
        targetIdentityKey: "old-session",
        input: toRecipePreviewInput(fullStackRecipeFixture),
      }),
    );
    assert.isTrue(Exit.isFailure(old));
    const current = yield* session.preview({
      sessionId: 41,
      targetIdentityKey: "current-session",
      input: toRecipePreviewInput(fullStackRecipeFixture),
    });
    assert.include(current.preview.command, "full-stack-app");
  }).pipe(Effect.scoped),
);

it.live(
  "keeps a session stable while a later session sees compatible changes",
  () =>
    Effect.gen(function* () {
      yield* setRegistryMode("current");
      yield* Effect.addFinalizer(() => setRegistryMode("current"));
      const session = yield* makeSession;
      const first = yield* session.catalog(50);
      const input = registryParityCases.bun;
      const previewFor = (sessionId: number) =>
        session.preview({ sessionId, targetIdentityKey: "revision", input });
      const firstPreview = yield* previewFor(50);
      yield* setRegistryMode("revised");
      const stillFirst = yield* session.catalog(50);
      const stillFirstPreview = yield* previewFor(50);
      const later = yield* session.catalog(51);
      const laterPreview = yield* previewFor(51);
      const mainFile = (files: typeof firstPreview.preview.files) =>
        files.find((file) => file.path === "apps/client-react-web/src/main.tsx")
          ?.contents ?? "";
      assert.deepEqual(stillFirst.catalog.targets, first.catalog.targets);
      assert.notDeepEqual(later.catalog.targets, first.catalog.targets);
      assert.include(later.catalog.targets[0]?.title ?? "", "revised");
      assert.strictEqual(
        mainFile(stillFirstPreview.preview.files),
        mainFile(firstPreview.preview.files),
      );
      assert.notInclude(
        mainFile(firstPreview.preview.files),
        "Registry revision marker",
      );
      assert.include(
        mainFile(laterPreview.preview.files),
        "Registry revision marker",
      );
    }).pipe(Effect.scoped),
);

it.live(
  "should return a generated repository when a recipe crosses the browser Worker boundary",
  () =>
    Effect.gen(function* () {
      const session = yield* makeSession;
      yield* session.catalog();
      const preview = yield* session.preview({
        sessionId: 1,
        targetIdentityKey: "full-stack",
        input: toRecipePreviewInput(fullStackRecipeFixture),
      });
      const targetKeys = preview.preview.blueprint.nodes.flatMap((node) =>
        node._tag === "target" ? [node.id] : [],
      );
      const paths = preview.preview.files.map((file) => file.path);

      assert.include(targetKeys, TargetKey.make("apps/client-react-web"));
      assert.include(targetKeys, TargetKey.make("apps/server-api"));
      assert.include(targetKeys, TargetKey.make("packages/domain"));
      assert.include(paths, "stack.effect.json");
      assert.include(
        preview.preview.files.find((file) => file.path === "stack.effect.json")
          ?.contents ?? "",
        STACK_CONFIG_SCHEMA_URL,
      );
      assert.include(paths, "apps/client-react-web/package.json");
      assert.include(paths, "apps/server-api/package.json");
      assert.include(paths, "packages/domain/package.json");
      assert.include(preview.preview.command, "full-stack-app");
    }).pipe(Effect.scoped),
);

it.live(
  "should return flattened catalog relationships when catalog data crosses the browser Worker boundary",
  () =>
    Effect.gen(function* () {
      const owner = new TargetIdentity({
        kind: TargetKind.make("server-mcp"),
        name: "mcp",
      });
      const result = yield* runAtom(catalogAtom, {
        sessionId: 1,
        sources: defaultCatalogSources,
        officialUrl: catalogSource(),
        targetIdentityKey: owner.toKey(),
        targets: [{ id: "mcp", owner }],
      });
      const targetModules = result.catalog.targetModules.find(
        (entry) => entry.owner.toKey() === owner.toKey(),
      );

      assert.isDefined(targetModules);
      assert.isNotEmpty(targetModules.modules);
      const parent = targetModules.modules.find(
        (module) => module.id === "mcp-tools",
      );
      assert.isDefined(parent);
      assert.isNotEmpty(parent.children);
      assert.include(
        targetModules.modules.map((module) => module.id),
        parent.children[0]?.moduleId,
      );
      assert.isTrue(
        targetModules.modules.every((module) =>
          module.children.every((child) => typeof child.moduleId === "string"),
        ),
      );
      assert.isNotEmpty(result.catalog.configuration.monorepo);
      const turbo = result.catalog.configuration.monorepo.find(
        (choice) => choice.value === "turbo",
      );
      assert.isDefined(turbo);
      assert.deepEqual(turbo.supportedRuntimes, ["bun", "node"]);
    }),
);

it.live(
  "should report an unsupported Deno module without stopping the preview worker",
  () =>
    Effect.gen(function* () {
      const session = yield* makeSession;
      yield* session.catalog();
      const invalid = yield* Effect.exit(
        session.preview({
          sessionId: 1,
          targetIdentityKey: "deno-turbo",
          input: toRecipePreviewInput({
            ...fullStackRecipeFixture,
            config: {
              ...fullStackRecipeFixture.config,
              runtime: { _tag: "deno" },
              typescript: "6",
              monorepo: "turbo",
              lint: undefined,
              format: undefined,
            },
          }),
        }),
      );

      assert.isTrue(Exit.isFailure(invalid));
      if (Exit.isFailure(invalid)) {
        const failure = Cause.findErrorOption(invalid.cause).pipe(
          Option.getOrUndefined,
        );
        assert.match(
          failure?.message ?? "",
          /does not support module workspace-monorepo-turbo/u,
        );
      }

      const valid = yield* session.preview({
        sessionId: 1,
        targetIdentityKey: "valid-after-deno-turbo",
        input: toRecipePreviewInput(fullStackRecipeFixture),
      });
      assert.include(valid.preview.command, "full-stack-app");
    }).pipe(Effect.scoped),
);

const officialPlusExt = () =>
  toRecipePreviewInput({
    ...fullStackRecipeFixture,
    gitEnabled: false,
    config: {
      ...fullStackRecipeFixture.config,
      name: "ext-app",
      catalogs: sourcesOf(official, customSource("ext")),
    },
    targets: [
      { id: "server", kind: "server", name: "api", modules: ["ext-auth"] },
    ],
    supportSelections: [],
  });

it.live(
  "composes the official catalog with a custom catalog that extends it",
  () =>
    Effect.gen(function* () {
      yield* setRegistryMode("current");
      const session = yield* makeSession;
      const input = officialPlusExt();
      const { catalog } = yield* session.catalog(
        60,
        input.config.catalogs ?? defaultCatalogSources,
      );
      assert.deepEqual(
        catalog.sources.map(({ name, freshness }) => ({ name, freshness })),
        [
          { name: "official", freshness: "current" },
          { name: "ext", freshness: "current" },
        ],
      );
      const preview = yield* session.preview({
        sessionId: 60,
        targetIdentityKey: "ext",
        input,
      });
      assert.include(
        preview.preview.files.map((file) => file.path),
        "apps/server-api/src/ext-auth.ts",
      );
      assert.include(
        preview.preview.command,
        `--catalog official --catalog 'ext=${customSource("ext").url}'`,
      );
      const cli = yield* cliParity(input, preview.preview.command);
      assert.deepEqual(preview.preview.blueprint, cli.blueprint);
      assert.deepEqual(preview.preview.files, cli.files);
    }).pipe(Effect.scoped),
  60_000,
);

it.live("labels definitions with the catalog that supplied them", () =>
  Effect.gen(function* () {
    const owner = new TargetIdentity({
      kind: TargetKind.make("server"),
      name: "api",
    });
    const result = yield* runAtom(catalogAtom, {
      sessionId: 1,
      sources: sourcesOf(official, customSource("ext")),
      officialUrl: catalogSource(),
      targetIdentityKey: owner.toKey(),
      targets: [{ id: "server", owner }],
    });
    const modules =
      result.catalog.targetModules.find(
        (entry) => entry.owner.toKey() === owner.toKey(),
      )?.modules ?? [];
    assert.strictEqual(
      modules.find((module) => module.id === "ext-auth")?.source,
      "ext",
    );
    assert.strictEqual(
      result.catalog.targets.find((target) => target.kind === "server")?.source,
      "official",
    );
  }),
);

it.live("previews a custom catalog without the official catalog", () =>
  Effect.gen(function* () {
    const session = yield* makeSession;
    const catalogs = sourcesOf(customSource("acme"));
    const { catalog } = yield* session.catalog(70, catalogs);
    assert.deepEqual(
      catalog.sources.map((source) => source.name),
      ["acme"],
    );
    assert.deepEqual(catalog.targets.map((target) => target.kind).sort(), [
      "api",
      "workspace",
    ]);
    const input = customOnlyInput("acme-app", catalogs, [
      {
        target: new TargetIdentity({
          kind: TargetKind.make("api"),
          name: "api",
        }),
        modules: [ModuleId.make("acme-api-rest")],
      },
    ]);
    const preview = yield* session.preview({
      sessionId: 70,
      targetIdentityKey: "acme",
      input,
    });
    const paths = preview.preview.files.map((file) => file.path);
    assert.include(paths, "README.md");
    assert.isTrue(paths.some((path) => path.endsWith("src/rest.ts")));
    const config =
      preview.preview.files.find((file) => file.path === "stack.effect.json")
        ?.contents ?? "";
    assert.notInclude(config, '"lint"');
    assert.include(config, customSource("acme").url);
  }).pipe(Effect.scoped),
);

it.live("combines two independent custom catalogs", () =>
  Effect.gen(function* () {
    const session = yield* makeSession;
    const { catalog } = yield* session.catalog(
      80,
      sourcesOf(customSource("acme"), customSource("beta")),
    );
    assert.deepEqual(
      catalog.targets.map(({ kind, source }) => `${kind}:${source}`).sort(),
      ["api:acme", "worker:beta", "workspace:acme"],
    );
  }).pipe(Effect.scoped),
);

it.live("names every catalog involved in a duplicate definition", () =>
  Effect.gen(function* () {
    const session = yield* makeSession;
    const failure = rpcFailure(
      yield* Effect.exit(
        session.catalog(
          90,
          sourcesOf(customSource("acme"), customSource("clash")),
        ),
      ),
    );
    assert.isDefined(failure);
    assert.include(
      failure?.issues?.map((issue) => issue.code) ?? [],
      "duplicate-id",
    );
    assert.match(failure?.message ?? "", /acme/u);
    assert.match(failure?.message ?? "", /clash/u);
  }).pipe(Effect.scoped),
);

it.live("uses one catalog's cached copy while the others stay current", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    yield* Effect.addFinalizer(() => setCustomOutage("ext", false));
    const catalogs = sourcesOf(official, customSource("ext", "?cache=100"));
    yield* Effect.gen(function* () {
      const seed = yield* makeSession;
      yield* seed.catalog(100, catalogs);
    }).pipe(Effect.scoped);
    yield* setCustomOutage("ext", true);
    const session = yield* makeSession;
    const { catalog } = yield* session.catalog(101, catalogs);
    const byName = new Map(
      catalog.sources.map((source) => [source.name, source]),
    );
    assert.strictEqual(byName.get("official")?.freshness, "current");
    assert.strictEqual(byName.get("ext")?.freshness, "cached");
    assert.strictEqual(byName.get("ext")?.warning?.kind, "stale");
    assert.strictEqual(
      byName.get("ext")?.warning?.sourceUrl,
      customSource("ext", "?cache=100").url,
    );
  }).pipe(Effect.scoped),
);

it.live("fails the session and names a catalog with no usable data", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    yield* setCustomOutage("ext", true);
    yield* Effect.addFinalizer(() => setCustomOutage("ext", false));
    const session = yield* makeSession;
    const source = customSource("ext", "?cold=110");
    const failure = rpcFailure(
      yield* Effect.exit(session.catalog(110, sourcesOf(official, source))),
    );
    assert.deepEqual(failure?.failedSource, {
      name: "ext",
      sourceUrl: source.url,
    });
    assert.include(failure?.message ?? "", "Catalog source ext");
    assert.include(failure?.message ?? "", source.url);
  }).pipe(Effect.scoped),
);

it.live("reports a blocked cross-origin catalog without naming a cause", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    const origin = new URL(window.location.origin);
    // The fixture sends no CORS headers, so the other loopback name is refused.
    origin.hostname =
      origin.hostname === "localhost" ? "127.0.0.1" : "localhost";
    const source = {
      name: "ext",
      url: new URL(
        "/registry-test/custom/ext.json?cors=120",
        origin,
      ).toString(),
    };
    const session = yield* makeSession;
    const failure = rpcFailure(
      yield* Effect.exit(session.catalog(120, sourcesOf(official, source))),
    );
    assert.strictEqual(failure?.failedSource?.name, "ext");
    assert.include(failure?.message ?? "", source.url);
    assert.include(failure?.message ?? "", "may not allow requests");
    assert.notMatch(failure?.message ?? "", /CORS/u);
  }).pipe(Effect.scoped),
);
