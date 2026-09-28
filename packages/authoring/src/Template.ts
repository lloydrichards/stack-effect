import { Predicate } from "effect";

/** A generated-file body kept in an ordinary file and embedded at build time. */
export interface TemplateRef {
  readonly _tag: "TemplateRef";
  readonly url: string;
}

export const isTemplateRef = (value: unknown): value is TemplateRef =>
  Predicate.isTagged(value, "TemplateRef") &&
  Predicate.hasProperty(value, "url") &&
  typeof value.url === "string";

/**
 * Resolve template paths against `base` with URL semantics, so a directory
 * base needs a trailing slash: `templates(new URL("../templates/", import.meta.url))`.
 * Nothing is read until `buildCatalog` runs.
 */
export const templates =
  (base: URL | string) =>
  (path: string): TemplateRef => ({
    _tag: "TemplateRef",
    url: new URL(path, base).href,
  });
