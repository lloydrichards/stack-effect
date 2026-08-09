import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { toRecipePreviewInput } from "../features/recipe-builder/recipe-builder-form";
import { fullStackRecipeFixture } from "../features/recipe-builder/recipe-fixtures";
import {
  RecipePreviewClient,
  RecipePreviewClientLive,
} from "./recipe-preview-client";

it.live(
  "should generate a repository preview when a full-stack Selection crosses the browser Worker boundary",
  () =>
    Effect.gen(function* () {
      const client = yield* RecipePreviewClient;
      const preview = yield* client.preview({
        input: toRecipePreviewInput(fullStackRecipeFixture),
      });
      const targetKeys = preview.blueprint.nodes.flatMap((node) =>
        node._tag === "target" ? [node.id] : [],
      );
      const paths = preview.files.map((file) => file.path);

      assert.include(targetKeys, "apps/client-react-web");
      assert.include(targetKeys, "apps/server-api");
      assert.include(targetKeys, "packages/domain");
      assert.include(paths, "stack.effect.json");
      assert.include(paths, "apps/client-react-web/package.json");
      assert.include(paths, "apps/server-api/package.json");
      assert.include(paths, "packages/domain/package.json");
      assert.include(preview.command, "full-stack-app");
    }).pipe(Effect.provide(RecipePreviewClientLive)),
);
