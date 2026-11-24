import {
  CatalogIssueCode,
  ModuleDefinition,
  SupportedRuntime,
  TargetDefinition,
  TargetIdentity,
  CatalogSources,
} from "@repo/domain/Catalog";
import { RecipePreview, RecipePreviewInput } from "@repo/domain/Recipe";
import { Cause, Option, Predicate, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const CatalogChoice = Schema.Struct({
  title: ModuleDefinition.fields.title,
  description: ModuleDefinition.fields.description,
  value: Schema.String,
  supportedRuntimes: Schema.Array(SupportedRuntime),
});

export const CatalogModule = Schema.Struct({
  supportedRuntimes: ModuleDefinition.fields.supportedRuntimes,
  id: ModuleDefinition.fields.id,
  title: ModuleDefinition.fields.title,
  description: ModuleDefinition.fields.description,
  visibility: Schema.requiredKey(ModuleDefinition.fields.visibility.schema),
  dependencies: ModuleDefinition.fields.dependencies,
  conflictsWith: ModuleDefinition.fields.conflictsWith,
  implies: Schema.requiredKey(ModuleDefinition.fields.implies.schema),
  children: Schema.requiredKey(ModuleDefinition.fields.children.schema),
  /** Selected source that supplied the module. */
  source: Schema.optional(Schema.String),
});

export type CatalogModule = typeof CatalogModule.Type;

/** One selected source as the session loaded it. */
const RecipeBuilderCatalogSource = Schema.Struct({
  name: Schema.String,
  sourceUrl: Schema.String,
  /** Sources the document depends on, such as `official`. */
  requires: Schema.Array(Schema.String),
  freshness: Schema.Literals(["current", "cached"]),
  warning: Schema.optional(
    Schema.Struct({
      kind: Schema.Literals(["stale", "persistence"]),
      sourceUrl: Schema.String,
      lastValidatedAt: Schema.Finite,
      message: Schema.String,
    }),
  ),
});

export const RecipeBuilderCatalog = Schema.Struct({
  sources: Schema.Array(RecipeBuilderCatalogSource),
  targets: Schema.Array(
    Schema.Struct({
      kind: TargetDefinition.fields.kind,
      title: TargetDefinition.fields.title,
      description: TargetDefinition.fields.description,
      defaultName: TargetDefinition.fields.defaultName,
      requiredModules: Schema.requiredKey(
        TargetDefinition.fields.requiredModules.schema,
      ),
      /** Selected source that supplied the target. */
      source: Schema.optional(Schema.String),
    }),
  ),
  targetModules: Schema.Array(
    Schema.Struct({
      owner: TargetIdentity,
      modules: Schema.Array(CatalogModule),
    }),
  ),
  configuration: Schema.Struct({
    monorepo: Schema.Array(CatalogChoice),
    lint: Schema.Array(CatalogChoice),
    format: Schema.Array(CatalogChoice),
    test: Schema.Array(CatalogChoice),
    devenv: Schema.Array(CatalogChoice),
    presets: Schema.Array(CatalogChoice),
  }),
});

export type RecipeBuilderCatalog = typeof RecipeBuilderCatalog.Type;

export class RecipeBuilderRpcError extends Schema.TaggedError<RecipeBuilderRpcError>()(
  "RecipeBuilderRpcError",
  {
    message: Schema.String,
    /** The selected source that failed to load, when one did. */
    failedSource: Schema.optional(
      Schema.Struct({ name: Schema.String, sourceUrl: Schema.String }),
    ),
    /** Composition issues across the selected sources. */
    issues: Schema.optional(
      Schema.Array(
        Schema.Struct({ code: CatalogIssueCode, message: Schema.String }),
      ),
    ),
    /** Sources that loaded before composition failed. */
    sources: Schema.optional(Schema.Array(RecipeBuilderCatalogSource)),
    /** Messages along the failure's cause chain, outermost first. */
    causes: Schema.optional(Schema.Array(Schema.String)),
  },
) {}

// `Cause.prettyErrors` turns every cause into an `Error` and cuts cycles.
const chainMessages = (error: unknown): ReadonlyArray<string> => {
  const cause = Predicate.hasProperty(error, "cause") ? error.cause : undefined;
  return cause instanceof Error ? [cause.message, ...chainMessages(cause)] : [];
};

/**
 * Messages along the cause chain below `error`, each once, outermost first.
 * The RPC error carries only strings, so the worker sends why with what.
 */
export const causeMessages = (error: unknown): ReadonlyArray<string> =>
  Cause.prettyErrors(Cause.fail(error)).flatMap((pretty) =>
    [...new Set([pretty.message, ...chainMessages(pretty)])]
      .slice(1)
      .filter((message) => message.length > 0),
  );

export const makeRecipeBuilderRpcError = (
  operation: "preview" | "catalog",
  error?: unknown,
) =>
  new RecipeBuilderRpcError({
    message: Schema.decodeUnknownOption(
      Schema.Struct({ message: Schema.String }),
    )(error).pipe(
      Option.match({
        onSome: (failure) => failure.message,
        onNone: () =>
          operation === "preview"
            ? "The recipe preview could not be generated."
            : "The recipe catalog could not be loaded.",
      }),
    ),
    causes: causeMessages(error),
  });

export class RecipeBuilderRpc extends RpcGroup.make(
  Rpc.make("preview", {
    payload: { ...RecipePreviewInput.fields, sessionId: Schema.Finite },
    success: RecipePreview,
    error: RecipeBuilderRpcError,
  }),
  Rpc.make("catalog", {
    payload: {
      owners: Schema.Array(TargetIdentity),
      sources: CatalogSources,
      /** Application-supplied URL for the reserved `official` source. */
      officialUrl: Schema.String,
      sessionId: Schema.Finite,
    },
    success: RecipeBuilderCatalog,
    error: RecipeBuilderRpcError,
  }),
) {}
