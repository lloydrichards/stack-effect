import { CatalogService } from "@repo/catalog";
import {
  type CatalogSources,
  isCustomCatalogSource,
  OFFICIAL_CATALOG_SOURCE,
} from "@repo/domain/CatalogSource";
import {
  type CatalogCompositionFailure,
  CatalogLoader,
  CatalogLoadFailure,
  type LoadedCatalogSet,
  type LoadedCatalogSource,
} from "@repo/scaffold";
import { Console, Context, DateTime, Effect, Layer } from "effect";

export const OFFICIAL_CATALOG_URL =
  "https://stack-effect.lloydrichards.dev/registry/v1/catalog.json";

const isoTime = (millis: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(millis));

/** One stderr line per source keeps stdout machine-readable. */
const warnAbout = ({ name, sourceUrl, warning }: LoadedCatalogSource) =>
  warning === undefined
    ? Effect.void
    : Console.error(
        warning.kind === "stale"
          ? `catalog ${name} (${sourceUrl}): using cached data last validated at ${isoTime(warning.lastValidatedAt)}.`
          : `catalog ${name} (${sourceUrl}): current, but it could not be cached (validated at ${isoTime(warning.lastValidatedAt)}).`,
      );

export class CatalogProvider extends Context.Service<
  CatalogProvider,
  {
    readonly load: (
      sources: CatalogSources,
    ) => Effect.Effect<
      LoadedCatalogSet,
      CatalogLoadFailure | CatalogCompositionFailure
    >;
  }
>()("CatalogProvider") {
  static readonly official = Layer.effect(
    this,
    Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      return {
        load: (sources) =>
          loader
            .loadSources({ sources, officialUrl: OFFICIAL_CATALOG_URL })
            .pipe(
              Effect.tap(({ sources }) => Effect.forEach(sources, warnAbout)),
            ),
      };
    }),
  );

  /** Local definitions for repository authoring; only the official source exists. */
  static readonly authoring = Layer.effect(
    this,
    Effect.gen(function* () {
      const catalog = yield* CatalogService;
      return {
        load: (sources) =>
          sources.every((source) => !isCustomCatalogSource(source.name))
            ? Effect.succeed({
                catalog,
                sources: [
                  {
                    name: OFFICIAL_CATALOG_SOURCE,
                    sourceUrl: "local:authoring",
                    digest: "",
                    freshness: "current" as const,
                  },
                ],
              })
            : Effect.fail(
                new CatalogLoadFailure({
                  reason: "invalidSource",
                  sourceUrl: "local:authoring",
                  message:
                    "The authoring entrypoint only provides the local official catalog.",
                }),
              ),
      };
    }),
  );
}
