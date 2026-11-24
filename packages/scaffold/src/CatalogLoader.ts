/**
 * Loads catalog registry documents over HTTP, validates them, caches them,
 * and composes the selected sources into one `CatalogService` for an
 * operation.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  CatalogCompositionFailure,
  CatalogLoadFailure,
  CatalogLoadWarning,
  CatalogSources,
  LoadedCatalogSource,
} from "@repo/domain/Catalog";
import { Context, type Effect, Layer } from "effect";
import type * as Digest from "effect/crypto/Digest";
import type { HttpClient } from "effect/http";
import type { CatalogCache } from "./CatalogCache";
import * as internal from "./internal/catalogLoader";

/**
 * One catalog document loaded as a `CatalogService`, with where it came from.
 *
 * **When to use**
 *
 * Read it from `CatalogLoader.load` when one URL is the whole catalog.
 */
export type LoadedCatalog = {
  readonly catalog: CatalogService["Service"];
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning | undefined;
};

/**
 * The selected sources composed into one catalog, with how each loaded.
 *
 * **When to use**
 *
 * Read it from `CatalogLoader.loadSources`. Reuse `catalog` across the whole
 * operation, and report `sources` to the user.
 */
export type LoadedCatalogSet = {
  readonly catalog: CatalogService["Service"];
  readonly sources: ReadonlyArray<LoadedCatalogSource>;
};

/**
 * Loads one catalog URL, or every selected catalog source, through the cache.
 *
 * **When to use**
 *
 * Production CLI commands and Recipe Builder sessions load catalogs through
 * it, then provide the resulting `CatalogService` to the scaffold services.
 *
 * **Gotchas**
 *
 * A source that cannot be fetched falls back to its cached copy with a
 * `stale` warning. A source with no usable copy fails the whole selection.
 * Finalize scripts are allowed only when the caller says so; a downloaded
 * catalog cannot grant itself that authority.
 */
export class CatalogLoader extends Context.Service<
  CatalogLoader,
  {
    readonly load: (input: {
      readonly sourceUrl: string;
      // Application-owned authority. Never inferred from a downloaded catalogId.
      readonly allowFinalizeScripts?: boolean;
    }) => Effect.Effect<LoadedCatalog, CatalogLoadFailure>;
    // Loads every selected source, then composes them once. Any source without
    // usable data fails the whole selection.
    readonly loadSources: (input: {
      readonly sources: CatalogSources;
      // Application-owned URL for the reserved `official` source.
      readonly officialUrl: string;
    }) => Effect.Effect<
      LoadedCatalogSet,
      CatalogLoadFailure | CatalogCompositionFailure
    >;
  }
>()("@repo/scaffold/CatalogLoader") {
  static readonly layer: Layer.Layer<
    CatalogLoader,
    never,
    HttpClient.HttpClient | CatalogCache | Digest.Digest
  > = Layer.effect(CatalogLoader, internal.make);
}
