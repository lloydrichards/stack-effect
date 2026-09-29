import {
  type CatalogSources,
  defaultCatalogSources,
  OFFICIAL_CATALOG_SOURCE,
} from "@repo/domain/CatalogSource";
import type { LoadedCatalogSource } from "@repo/scaffold";
import { Context, Option } from "effect";

/** The catalog sources a command resolved and loaded before any other work. */
export interface CatalogSelectionShape {
  /** Sources passed with --catalog; only these are saved by init and create. */
  readonly explicit: Option.Option<CatalogSources>;
  readonly sources: CatalogSources;
  readonly loaded: ReadonlyArray<LoadedCatalogSource>;
}

export const CatalogSelection = Context.Reference<CatalogSelectionShape>(
  "stack-effect/CatalogSelection",
  {
    defaultValue: () => ({
      explicit: Option.none(),
      sources: defaultCatalogSources,
      loaded: [],
    }),
  },
);

export const selectsOfficial = (sources: CatalogSources) =>
  sources.some((source) => source.name === OFFICIAL_CATALOG_SOURCE);

/** Scripts from a named, non-official source need --trust or an explicit opt-in. */
export const isCustomSource = (source: string | undefined) =>
  source !== undefined && source !== OFFICIAL_CATALOG_SOURCE;
