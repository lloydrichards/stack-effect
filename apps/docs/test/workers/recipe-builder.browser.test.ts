import { assert, it } from "@effect/vitest";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import { Cause, Effect, Exit, Option } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { catalogAtom, previewAtom } from "../../app/atom/recipe-builder-atom";
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

it.live(
  "should return a generated repository when a recipe crosses the browser Worker boundary",
  () =>
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
  "should return flattened catalog relationships when catalog data crosses the browser Worker boundary",
  () =>
    Effect.gen(function* () {
      const owner = new TargetIdentity({
        kind: TargetKind.make("server-mcp"),
        name: "mcp",
      });
      const result = yield* runAtom(catalogAtom, {
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
      const invalid = yield* Effect.exit(
        runAtom(previewAtom, {
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

      const valid = yield* runAtom(previewAtom, {
        targetIdentityKey: "valid-after-deno-turbo",
        input: toRecipePreviewInput(fullStackRecipeFixture),
      });
      assert.include(valid.preview.command, "full-stack-app");
    }),
);
