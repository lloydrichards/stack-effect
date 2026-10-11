import { describe, expect, it } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { StackConfig } from "@repo/domain/Scaffold";
import {
  BlueprintService,
  RecipeService,
  RecipeTargetString,
} from "@repo/scaffold";
import { Effect, Layer, Option, Schema } from "effect";
import { buildWorkspaceSelection } from "./catalog";

const config = new StackConfig({
  name: "catalog-built",
  runtime: { _tag: "deno" },
  typescript: "7",
});
const TestLayer = Layer.mergeAll(
  RecipeService.layer,
  BlueprintService.layer,
).pipe(Layer.provideMerge(OfficialCatalogLayer));

describe("catalog authoring workspace runtime", () => {
  it.effect(
    "generates the default Deno blueprint without unsupported modules",
    () =>
      Effect.gen(function* () {
        const selection = yield* buildWorkspaceSelection(config, Option.none());
        expect(
          selection.targets.flatMap((target) =>
            target.modules.map((module) => module.id),
          ),
        ).not.toContain("package-library");
        const blueprint = yield* (yield* BlueprintService).resolve(
          selection,
          config,
        );
        expect(blueprint).toBeDefined();
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects an explicit unsupported Deno library", () =>
    Effect.gen(function* () {
      const selection = yield* buildWorkspaceSelection(
        config,
        Option.some([
          yield* Schema.decodeEffect(RecipeTargetString)(
            "package/library:package-library",
          ),
        ]),
      );
      const error = yield* Effect.flip(
        (yield* BlueprintService).resolve(selection, config),
      );
      expect(error.message).toContain(
        "Runtime deno does not support module package-library",
      );
    }).pipe(Effect.provide(TestLayer)),
  );
});
