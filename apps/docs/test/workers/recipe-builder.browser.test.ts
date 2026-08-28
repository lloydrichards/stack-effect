import { assert, it } from "@effect/vitest";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { catalogAtom, previewAtom } from "../../app/atom/recipe-builder-atom";
import { toRecipePreviewInput } from "../../app/components/recipe-builder/form";
import {
  fullStackRecipeFixture,
  makeGitHookRecipeFixture,
} from "../components/recipe-builder/recipe-fixtures";

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

const workspaceModules = (preview: {
  readonly selection: {
    readonly targets: ReadonlyArray<{
      readonly identity: { readonly kind: string };
      readonly modules: ReadonlyArray<{ readonly id: string }>;
    }>;
  };
}) =>
  preview.selection.targets
    .find(({ identity }) => identity.kind === "workspace")
    ?.modules.map(({ id }) => id) ?? [];

const blueprintModules = (preview: {
  readonly blueprint: {
    readonly nodes: ReadonlyArray<
      | { readonly _tag: "target" }
      | { readonly _tag: "attached-module"; readonly moduleId: string }
    >;
  };
}) =>
  preview.blueprint.nodes.flatMap((node) =>
    node._tag === "attached-module" ? [node.moduleId] : [],
  );

const previewFile = (
  preview: {
    readonly files: ReadonlyArray<{ path: string; contents: string }>;
  },
  path: string,
) => preview.files.find((file) => file.path === path);

const assertNoProviderArtifacts = (preview: {
  readonly files: ReadonlyArray<{ path: string; contents: string }>;
}) => {
  const paths = preview.files.map(({ path }) => path);
  assert.notInclude(paths, "lefthook.yml");
  assert.notInclude(paths, ".husky/pre-commit");
  assert.notInclude(paths, "lint-staged.config.mjs");
  const packageJson = JSON.parse(
    previewFile(preview, "package.json")?.contents ?? "{}",
  );
  assert.notProperty(packageJson.devDependencies ?? {}, "lefthook");
  assert.notProperty(packageJson.devDependencies ?? {}, "husky");
  assert.notProperty(packageJson.devDependencies ?? {}, "lint-staged");
};

it.live(
  "should plan exclusive Git-hook artifacts through the unmocked browser Worker",
  () =>
    Effect.gen(function* () {
      const runPreview = (
        fixture: Parameters<typeof toRecipePreviewInput>[0],
      ) =>
        runAtom(previewAtom, {
          targetIdentityKey: "git-hook-preview",
          input: toRecipePreviewInput(fixture),
        }).pipe(Effect.map(({ preview }) => preview));

      const none = yield* runPreview(makeGitHookRecipeFixture());
      assert.include(none.command, "--git-hooks none");
      assert.include(workspaceModules(none), "workspace-devenv-git");
      assert.include(workspaceModules(none), "workspace-devenv-nix-flake");
      assert.isFalse(
        blueprintModules(none).some((id) =>
          id.startsWith("workspace-git-hooks-"),
        ),
      );
      assertNoProviderArtifacts(none);

      const lefthook = yield* runPreview(
        makeGitHookRecipeFixture({
          provider: "lefthook",
          runtime: "node",
          packageManager: "pnpm",
        }),
      );
      assert.include(lefthook.command, "--git-hooks lefthook");
      assert.include(
        workspaceModules(lefthook),
        "workspace-git-hooks-lefthook",
      );
      assert.include(
        blueprintModules(lefthook),
        "workspace-git-hooks-lefthook",
      );
      assert.notInclude(
        blueprintModules(lefthook),
        "workspace-git-hooks-husky",
      );
      assert.strictEqual(
        previewFile(lefthook, "lefthook.yml")?.contents,
        `pre-commit:\n  parallel: false\n  commands:\n    format:\n      glob: "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"\n      run: "pnpm run git-hooks:format -- {staged_files}"\n      stage_fixed: true\n    lint:\n      glob: "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"\n      run: "pnpm run git-hooks:lint -- {staged_files}"\n      stage_fixed: true\n`,
      );
      assert.strictEqual(
        previewFile(lefthook, "pnpm-workspace.yaml")?.contents,
        `packages:\n  - "apps/*"\n  - "packages/*"\n\nallowBuilds:\n  esbuild: true\n  msgpackr-extract: true\n  lefthook: true\n`,
      );
      const lefthookPackage = JSON.parse(
        previewFile(lefthook, "package.json")?.contents ?? "{}",
      );
      assert.strictEqual(lefthookPackage.devDependencies.lefthook, "2.1.10");
      assert.strictEqual(
        lefthookPackage.scripts["lefthook:install"],
        "lefthook install",
      );
      assert.strictEqual(
        lefthookPackage.scripts.prepare,
        "effect-language-service patch",
      );

      const husky = yield* runPreview(
        makeGitHookRecipeFixture({
          provider: "husky",
          runtime: "node",
          packageManager: "npm",
        }),
      );
      assert.include(husky.command, "--git-hooks husky");
      assert.include(workspaceModules(husky), "workspace-git-hooks-husky");
      assert.include(blueprintModules(husky), "workspace-git-hooks-husky");
      assert.notInclude(
        blueprintModules(husky),
        "workspace-git-hooks-lefthook",
      );
      assert.strictEqual(
        previewFile(husky, ".husky/pre-commit")?.contents,
        "npm run lint-staged\n",
      );
      assert.include(
        previewFile(husky, "lint-staged.config.mjs")?.contents ?? "",
        '"npm run git-hooks:format --",',
      );
      const huskyPackage = JSON.parse(
        previewFile(husky, "package.json")?.contents ?? "{}",
      );
      assert.strictEqual(huskyPackage.devDependencies.husky, "9.1.7");
      assert.strictEqual(huskyPackage.devDependencies["lint-staged"], "17.4.1");
      assert.strictEqual(
        huskyPackage.scripts.prepare,
        "effect-language-service patch",
      );
      assert.isUndefined(previewFile(husky, "pnpm-workspace.yaml"));

      for (const cleared of [
        makeGitHookRecipeFixture({ provider: "lefthook", gitEnabled: false }),
        makeGitHookRecipeFixture({ provider: "husky", runtime: "bun" }),
      ]) {
        const preview = yield* runPreview(cleared);
        assert.include(preview.command, "--git-hooks none");
        assert.include(workspaceModules(preview), "workspace-devenv-nix-flake");
        assert.isFalse(
          blueprintModules(preview).some((id) =>
            id.startsWith("workspace-git-hooks-"),
          ),
        );
        assertNoProviderArtifacts(preview);
      }

      const noGit = yield* runPreview(
        makeGitHookRecipeFixture({ gitEnabled: false }),
      );
      assert.include(noGit.command, "--no-git");
      assert.notInclude(workspaceModules(noGit), "workspace-devenv-git");

      for (const preview of [none, lefthook, husky, noGit]) {
        const config = JSON.parse(
          previewFile(preview, "stack.effect.json")?.contents ?? "{}",
        );
        assert.notProperty(config, "gitHooks");
        assert.notProperty(config, "gitHookProvider");
      }
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
    }),
);
