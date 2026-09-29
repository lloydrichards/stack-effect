import {
  type CatalogSources,
  defaultCatalogSources,
  isCustomCatalogSource,
} from "@repo/domain/CatalogSource";
import type { LoadedCatalogSource } from "@repo/scaffold";
import { Array as Arr, Context, Option } from "effect";

/** The catalog sources a command resolved and loaded before any other work. */
interface CatalogSelectionShape {
  /** Sources init and create save: --catalog, or init's existing saved set. */
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

export const customSourcesOf = (
  scripts: ReadonlyArray<{ readonly source?: string | undefined }>,
) =>
  Arr.dedupe(
    scripts.flatMap(({ source }) =>
      source !== undefined && isCustomCatalogSource(source) ? [source] : [],
    ),
  );

export const sourceLabel = (
  loaded: ReadonlyArray<LoadedCatalogSource>,
  source: string,
) =>
  `catalog ${source} (${
    loaded.find((entry) => entry.name === source)?.sourceUrl ?? "unknown URL"
  })`;

/** One line per custom source whose scripts wait for --trust. */
export const trustNotes = (
  scripts: ReadonlyArray<{ readonly source?: string | undefined }>,
  loaded: ReadonlyArray<LoadedCatalogSource>,
) =>
  customSourcesOf(scripts).map(
    (source) =>
      `${sourceLabel(loaded, source)}: finalize scripts from this catalog run only with --trust.`,
  );
