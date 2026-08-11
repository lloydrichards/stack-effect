import { assert, it } from "@effect/vitest";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import { Effect, Option, Stream } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { toRecipePreviewInput } from "../recipe-builder-form";
import { fullStackRecipeFixture } from "../recipe-fixtures";
import { catalogAtom, previewAtom } from "./client";

const runAtom = <Arg, A, E>(
  atom: import("effect/unstable/reactivity").Atom.AtomResultFn<Arg, A, E>,
  argument: Arg,
) =>
  Effect.gen(function* () {
    const registry = AtomRegistry.make();
    const unmount = registry.mount(atom);
    yield* Effect.addFinalizer(() => Effect.sync(unmount));
    registry.set(atom, argument);
    return yield* AtomRegistry.toStreamResult(registry, atom).pipe(
      Stream.runHead,
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.die("The worker atom completed without a value."),
          onSome: Effect.succeed,
        }),
      ),
    );
  }).pipe(Effect.scoped);

it.live("decodes recipe previews across the browser Worker boundary", () =>
  Effect.gen(function* () {
    const preview = yield* runAtom(previewAtom, {
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
    assert.include(paths, "apps/client-react-web/package.json");
    assert.include(paths, "apps/server-api/package.json");
    assert.include(paths, "packages/domain/package.json");
    assert.include(preview.preview.command, "full-stack-app");
  }),
);

it.live(
  "decodes flattened catalog projections across the Worker boundary",
  () =>
    Effect.gen(function* () {
      const owner = new TargetIdentity({
        kind: TargetKind.make("server-mcp"),
        name: "mcp",
      });
      const result = yield* runAtom(catalogAtom, {
        targetIdentityKey: owner.toKey(),
        owners: [owner],
        source: "identity",
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
    }),
);
