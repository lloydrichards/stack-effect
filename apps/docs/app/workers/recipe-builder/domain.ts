import {
  CatalogIssueCode,
  ModuleDefinition,
  SupportedRuntime,
  TargetDefinition,
  TargetIdentity,
} from "@repo/domain/Catalog";
import { CatalogSources } from "@repo/domain/CatalogSource";
import {
  RecipePreview,
  RecipePreviewInput,
} from "@repo/scaffold/recipe-preview";
import { Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const CatalogChoice = Schema.Struct({
  title: ModuleDefinition.fields.title,
  description: ModuleDefinition.fields.description,
  value: Schema.String,
  supportedRuntimes: Schema.Array(SupportedRuntime),
});

export const CatalogModule = Schema.Struct({
  id: ModuleDefinition.fields.id,
  title: ModuleDefinition.fields.title,
  description: ModuleDefinition.fields.description,
  visibility: Schema.requiredKey(ModuleDefinition.fields.visibility.schema),
  dependencies: ModuleDefinition.fields.dependencies,
  implies: Schema.requiredKey(ModuleDefinition.fields.implies.schema),
  children: Schema.requiredKey(ModuleDefinition.fields.children.schema),
  /** Selected source that supplied the module. */
  source: Schema.optional(Schema.String),
});

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
  }),
});

export class RecipeBuilderRpcFailure extends Schema.TaggedError<RecipeBuilderRpcFailure>()(
  "RecipeBuilderRpcFailure",
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
  },
) {}

export const makeRecipeBuilderRpcFailure = (
  operation: "preview" | "catalog",
  error?: unknown,
) =>
  new RecipeBuilderRpcFailure({
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
  });

export class RecipeBuilderRpc extends RpcGroup.make(
  Rpc.make("preview", {
    payload: { ...RecipePreviewInput.fields, sessionId: Schema.Finite },
    success: RecipePreview,
    error: RecipeBuilderRpcFailure,
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
    error: RecipeBuilderRpcFailure,
  }),
) {}
