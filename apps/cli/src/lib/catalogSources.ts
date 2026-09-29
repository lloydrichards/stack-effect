import {
  CatalogSources,
  defaultCatalogSources,
} from "@repo/domain/CatalogSource";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Option, Schema } from "effect";
import { CONFIG_FILENAME } from "../service/ConfigureService";

const describe = (sources: CatalogSources) =>
  sources
    .map((source) =>
      "url" in source ? `${source.name}=${source.url}` : source.name,
    )
    .join(", ");

const sourceKey = (source: CatalogSources[number]) =>
  "url" in source ? `${source.name}=${source.url}` : source.name;

/** Order carries no meaning, so compare selections as sets. */
export const sameCatalogSources = (a: CatalogSources, b: CatalogSources) => {
  const keys = new Set(a.map(sourceKey));
  return (
    a.length === b.length && b.every((source) => keys.has(sourceKey(source)))
  );
};

const parseCatalogFlag = (entry: string) => {
  const separator = entry.indexOf("=");
  if (separator !== -1)
    return Effect.succeed({
      name: entry.slice(0, separator),
      url: entry.slice(separator + 1),
    });
  return entry === "official"
    ? Effect.succeed({ name: entry })
    : Effect.fail(
        `Invalid --catalog "${entry}": use "official" or <name>=<url>.`,
      );
};

/** Parse repeated `--catalog official` / `--catalog <name>=<url>` values. */
export const parseCatalogFlags = Effect.fn("parseCatalogFlags")(function* (
  values: Option.Option<ReadonlyArray<string>>,
) {
  if (Option.isNone(values)) return Option.none<CatalogSources>();
  const raw = yield* Effect.forEach(values.value, parseCatalogFlag);
  const sources = yield* Schema.decodeUnknownEffect(CatalogSources)(raw).pipe(
    Effect.mapError((error) => `Invalid --catalog selection: ${error.message}`),
  );
  return Option.some(sources);
});

/** `init` and `create`: flags define the exact set; no flags means official only. */
export const selectionFromFlags = (
  values: Option.Option<ReadonlyArray<string>>,
) =>
  parseCatalogFlags(values).pipe(
    Effect.map((explicit) => ({
      explicit,
      sources: Option.getOrElse(explicit, () => defaultCatalogSources),
    })),
  );

/** Existing projects use their saved set; a differing --catalog set is an error. */
export const selectionFromProject = <E, R>(
  values: Option.Option<ReadonlyArray<string>>,
  config: Effect.Effect<Option.Option<StackConfig>, E, R>,
) =>
  Effect.gen(function* () {
    const explicit = yield* parseCatalogFlags(values);
    const saved = yield* config;
    const savedSources = Option.map(saved, (value) => value.catalogSources);
    if (
      Option.isSome(explicit) &&
      Option.isSome(savedSources) &&
      !sameCatalogSources(explicit.value, savedSources.value)
    )
      return yield* Effect.fail(
        `--catalog selects ${describe(explicit.value)}, but ${CONFIG_FILENAME} saves ${describe(savedSources.value)}. Edit "catalogs" in ${CONFIG_FILENAME} to change sources.`,
      );
    return {
      explicit,
      sources: Option.getOrElse(
        Option.orElse(explicit, () => savedSources),
        () => defaultCatalogSources,
      ),
    };
  });
