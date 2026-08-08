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
import { Layer } from "effect";
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
).pipe(Layer.provideMerge(CatalogService.layer));
