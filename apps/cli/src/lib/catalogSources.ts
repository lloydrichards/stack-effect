import {
  CatalogSources,
  defaultCatalogSources,
  formatCatalogSources,
  sameCatalogSources,
} from "@repo/domain/CatalogSource";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Data, Effect, Option, Schema } from "effect";
import { CONFIG_FILENAME } from "../service/ConfigureService";

/** A --catalog selection the CLI refuses before loading any catalog. */
export class CatalogSelectionError extends Data.TaggedError(
  "CatalogSelectionError",
)<{
  readonly reason: "invalidFlag" | "mismatch";
  readonly message: string;
}> {}

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
        new CatalogSelectionError({
          reason: "invalidFlag",
          message: `Invalid --catalog "${entry}": use "official" or <name>=<url>.`,
        }),
      );
};

/** Parse repeated `--catalog official` / `--catalog <name>=<url>` values. */
export const parseCatalogFlags = Effect.fn("parseCatalogFlags")(function* (
  values: Option.Option<ReadonlyArray<string>>,
) {
  if (Option.isNone(values)) return Option.none<CatalogSources>();
  const raw = yield* Effect.forEach(values.value, parseCatalogFlag);
  const sources = yield* Schema.decodeUnknownEffect(CatalogSources)(raw).pipe(
    Effect.mapError(
      (error) =>
        new CatalogSelectionError({
          reason: "invalidFlag",
          message: `Invalid --catalog selection: ${error.message}`,
        }),
    ),
  );
  return Option.some(sources);
});

/**
 * `init` and `create`: flags define the exact set. Without flags a project's
 * saved set is kept, so re-initialising never drops it; otherwise official only.
 */
export const selectionFromFlags = <E, R>(
  values: Option.Option<ReadonlyArray<string>>,
  saved: Effect.Effect<Option.Option<StackConfig>, E, R>,
) =>
  Effect.gen(function* () {
    const flags = yield* parseCatalogFlags(values);
    const explicit = Option.isSome(flags)
      ? flags
      : Option.flatMap(yield* saved, (config) =>
          Option.fromUndefinedOr(config.catalogs),
        );
    return {
      explicit,
      sources: Option.getOrElse(explicit, () => defaultCatalogSources),
    };
  });

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
      return yield* new CatalogSelectionError({
        reason: "mismatch",
        message: `--catalog selects ${formatCatalogSources(explicit.value)}, but ${CONFIG_FILENAME} saves ${formatCatalogSources(savedSources.value)}. Edit "catalogs" in ${CONFIG_FILENAME} to change sources.`,
      });
    return {
      explicit,
      sources: Option.getOrElse(
        Option.orElse(explicit, () => savedSources),
        () => defaultCatalogSources,
      ),
    };
  });
