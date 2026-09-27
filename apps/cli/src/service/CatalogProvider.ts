import { CatalogService } from "@repo/catalog";
import { CatalogLoader, type CatalogLoadFailure } from "@repo/scaffold";
import { Console, Context, DateTime, Effect, Layer } from "effect";

export const OFFICIAL_CATALOG_URL =
  "https://stack-effect.lloydrichards.dev/registry/v1/catalog.json";

export class CatalogProvider extends Context.Service<
  CatalogProvider,
  {
    readonly load: Effect.Effect<
      typeof CatalogService.Service,
      CatalogLoadFailure
    >;
  }
>()("CatalogProvider") {
  static readonly official = Layer.effect(
    this,
    Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      return {
        load: loader
          .load({
            sourceUrl: OFFICIAL_CATALOG_URL,
            allowFinalizeScripts: true,
          })
          .pipe(
            Effect.tap(({ warning }) =>
              warning === undefined
                ? Effect.void
                : Console.error(
                    warning.kind === "stale"
                      ? `Using cached catalog from ${warning.sourceUrl}; last validated at ${DateTime.formatIso(DateTime.makeUnsafe(warning.lastValidatedAt))}.`
                      : `Catalog from ${warning.sourceUrl} is current, but it could not be cached (validated at ${DateTime.formatIso(DateTime.makeUnsafe(warning.lastValidatedAt))}).`,
                  ),
            ),
            Effect.map(({ catalog }) => catalog),
          ),
      };
    }),
  );

  static readonly authoring = Layer.effect(
    this,
    Effect.gen(function* () {
      const catalog = yield* CatalogService;
      return { load: Effect.succeed(catalog) };
    }),
  );
}
