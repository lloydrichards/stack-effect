import { assert, it } from "@effect/vitest";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import { STACK_CONFIG_SCHEMA_URL } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, Option } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { AtomRegistry } from "effect/unstable/reactivity";
import {
  catalogAtom,
  previewAtom,
  type PreviewAtomRequest,
} from "../../app/atom/recipe-builder-atom";
import { toRecipePreviewInput } from "../../app/components/recipe-builder/form";
import { fullStackRecipeFixture } from "../components/recipe-builder/recipe-fixtures";

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

const setRegistryMode = (mode: "current" | "outage" | "invalid") =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    yield* client.get(
      `${window.location.origin}/registry-test/mode?value=${mode}`,
    );
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);

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
    catalog: (sessionId = 1, sourceUrl = catalogSource()) => {
      registry.set(catalogAtom, {
        sessionId,
        sourceUrl,
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

it.live("uses a persisted catalog after reload during an outage", () =>
  Effect.gen(function* () {
    yield* setRegistryMode("current");
    yield* Effect.addFinalizer(() => setRegistryMode("current"));
    yield* Effect.gen(function* () {
      const session = yield* makeSession;
      assert.strictEqual(
        (yield* session.catalog(20)).catalog.freshness,
        "current",
      );
    }).pipe(Effect.scoped);
    yield* setRegistryMode("outage");
    const reloaded = yield* makeSession;
    const result = yield* reloaded.catalog(21);
    assert.strictEqual(result.catalog.freshness, "cached");
    assert.strictEqual(result.catalog.warning?.kind, "stale");
    assert.strictEqual(result.catalog.warning?.sourceUrl, catalogSource());
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
          yield* Effect.exit(seed.catalog(32, `${catalogSource()}?cold=32`)),
        ),
      );
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
        sourceUrl: catalogSource(),
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
