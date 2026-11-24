/**
 * Catalog builds: turn authored definitions and their template files into a
 * deterministic v1 catalog document, with located issues and provenance.
 */
import {
  type CatalogDocument,
  CatalogIssueCode,
  CatalogIssueSubject,
} from "@repo/domain/Catalog";
import { Data, Effect, type FileSystem, type Path, Schema } from "effect";
import type { CatalogInput } from "./Define";
import * as internal from "./internal/build";

export {
  type CatalogDocument,
  type CatalogIssueCode,
  CatalogIssueSubject,
} from "@repo/domain/Catalog";

export const CatalogBuildIssueCode = Schema.Union([
  CatalogIssueCode,
  Schema.Literals([
    "invalid-options",
    "missing-template",
    "invalid-template",
    "unsupported-capability",
  ]),
]);
export type CatalogBuildIssueCode = typeof CatalogBuildIssueCode.Type;

/** One build failure, located by its definition, source file and template. */
export const CatalogBuildIssue = Schema.Struct({
  subject: CatalogIssueSubject,
  code: CatalogBuildIssueCode,
  message: Schema.String,
  sources: Schema.Array(Schema.String),
  template: Schema.optionalKey(Schema.String),
});
export type CatalogBuildIssue = typeof CatalogBuildIssue.Type;

const formatIssue = (issue: CatalogBuildIssue): string => {
  const location = [
    ...(issue.sources.length ? [issue.sources.join(", ")] : []),
    ...(issue.template === undefined ? [] : [`template ${issue.template}`]),
  ].join(" ");
  return location ? `${location}: ${issue.message}` : issue.message;
};

export class CatalogBuildError extends Data.TaggedError("CatalogBuildError")<{
  readonly issues: ReadonlyArray<CatalogBuildIssue>;
}> {
  override get message(): string {
    return ["Catalog build failed:", ...this.issues.map(formatIssue)].join(
      "\n  ",
    );
  }
}

export const TemplateProvenance = Schema.Struct({
  contribution: Schema.Int,
  field: Schema.String,
  contributionPath: Schema.String,
  template: Schema.String,
});
export type TemplateProvenance = typeof TemplateProvenance.Type;

/** Where a definition and its template-backed contributions were authored. */
export const DefinitionProvenance = Schema.Struct({
  subject: CatalogIssueSubject,
  source: Schema.String,
  templates: Schema.Array(TemplateProvenance),
});
export type DefinitionProvenance = typeof DefinitionProvenance.Type;

export type BuildCatalogOptions = {
  readonly catalogId: string;
  /**
   * Directory, as a file URL or absolute path, that every source and template
   * must live in. Reported paths are relative to it, so builds are portable.
   */
  readonly root: URL | string;
  /**
   * `"allow"` publishes Finalize scripts. Consumers still decide whether to
   * run them: the CLI runs a custom catalog's scripts only with consent.
   */
  readonly finalizeScripts?: "reject" | "allow";
  /**
   * Sources this catalog may reference. v1 accepts only the official source;
   * pass its document as `official` so references are checked as the CLI does.
   */
  readonly requires?: ReadonlyArray<"official">;
  /** The official catalog document, used for validation and never embedded. */
  readonly official?: CatalogDocument;
};

export type BuildCatalogResult = {
  readonly json: string;
  readonly document: CatalogDocument;
  readonly provenance: ReadonlyArray<DefinitionProvenance>;
};

/**
 * Build a deterministic v1 catalog document from authored definitions.
 *
 * Stages run in order (options and sources, templates, definition shape,
 * references, interpreter capabilities) and the build stops after the first
 * stage that reports issues.
 */
export const buildCatalog: (
  catalog: CatalogInput,
  options: BuildCatalogOptions,
) => Effect.Effect<
  BuildCatalogResult,
  CatalogBuildError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn("Authoring.buildCatalog")(function* (catalog, options) {
  return yield* internal
    .buildCatalog(catalog, options)
    .pipe(Effect.mapError((issues) => new CatalogBuildError({ issues })));
});
