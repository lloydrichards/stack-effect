import { CatalogService } from "@repo/catalog";
import {
  type CatalogSources,
  selectsOfficialCatalog,
} from "@repo/domain/CatalogSource";
import { StackConfig } from "@repo/domain/Scaffold";
import { ApplyService } from "@repo/scaffold/ApplyService";
import { ApplyWorkspaces } from "@repo/scaffold/ApplyWorkspaces";
import { BlueprintService } from "@repo/scaffold/BlueprintService";
import { ContributionResolver } from "@repo/scaffold/ContributionResolver";
import { FinalizeService } from "@repo/scaffold/FinalizeService";
import { PlanService } from "@repo/scaffold/PlanService";
import { RecipeService } from "@repo/scaffold/RecipeService";
import { StackConfigDefaults } from "@repo/scaffold/StackConfigDefaults";
import { Effect, Layer, type Option } from "effect";
import { CatalogProvider } from "./service/CatalogProvider";
import { CatalogSelection } from "./service/CatalogSelection";
import { ConfigureService } from "./service/ConfigureService";
import { ScaffoldPipeline } from "./service/ScaffoldPipeline";

const StackEffectServicesLayer = Layer.mergeAll(
  ApplyService.layer,
  ApplyWorkspaces.layer,
  BlueprintService.layer,
  ContributionResolver.layer,
  FinalizeService.layer,
  PlanService.layer,
  ConfigureService.layer,
  RecipeService.layer,
  ScaffoldPipeline.layer,
);

/** Official tool defaults are official-catalog vocabulary; custom-only sets get none. */
const customOnlyDefaults = (defaults: StackConfig) =>
  new StackConfig({
    name: defaults.name,
    runtime: defaults.runtime,
    typescript: defaults.typescript,
  });

/**
 * Resolve the source set first, then load it, and only then construct
 * services, so every stage of the command shares one composed catalog.
 */
export const commandServicesLayer = <E, R>(
  selection: Effect.Effect<
    {
      readonly explicit: Option.Option<CatalogSources>;
      readonly sources: CatalogSources;
    },
    E,
    R
  >,
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const { explicit, sources } = yield* selection;
      const loaded = yield* (yield* CatalogProvider).load(sources);
      const defaults = yield* StackConfigDefaults;
      return StackEffectServicesLayer.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            Layer.succeed(CatalogService, loaded.catalog),
            Layer.succeed(CatalogSelection, {
              explicit,
              sources,
              loaded: loaded.sources,
            }),
            Layer.succeed(
              StackConfigDefaults,
              selectsOfficialCatalog(sources)
                ? defaults
                : customOnlyDefaults(defaults),
            ),
          ),
        ),
      );
    }),
  );
