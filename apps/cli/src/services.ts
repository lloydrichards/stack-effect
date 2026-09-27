import { CatalogService } from "@repo/catalog";
import {
  ApplyPreviewService,
  ApplyService,
  BlueprintService,
  ContributionResolver,
  FinalizeService,
  PlanService,
  RecipeService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Effect, Layer } from "effect";
import { CatalogProvider } from "./service/CatalogProvider";
import { ConfigureService } from "./service/ConfigureService";
import { ScaffoldPipeline } from "./service/ScaffoldPipeline";

export const StackEffectServicesLayer = Layer.mergeAll(
  ApplyPreviewService.layer,
  ApplyService.layer,
  BlueprintService.layer,
  ContributionResolver.layer,
  FinalizeService.layer,
  PlanService.layer,
  ScaffoldFormatter.layer,
  ConfigureService.layer,
  RecipeService.layer,
  ScaffoldPipeline.layer,
);

/** Construct services only after the parsed command asks for a catalog. */
export const CommandServicesLayer = Layer.unwrap(
  Effect.gen(function* () {
    const catalog = yield* (yield* CatalogProvider).load;
    return StackEffectServicesLayer.pipe(
      Layer.provideMerge(Layer.succeed(CatalogService, catalog)),
    );
  }),
);
