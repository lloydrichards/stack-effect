import {
  ModuleDefinition,
  TargetDefinition,
  TargetIdentity,
} from "@repo/domain/Catalog";
import {
  RecipePreview,
  RecipePreviewInput,
} from "@repo/scaffold/recipe-preview";
import { Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

const CatalogChoice = Schema.Struct({
  title: ModuleDefinition.fields.title,
  description: ModuleDefinition.fields.description,
  value: Schema.String,
});

export const CatalogModule = Schema.Struct({
  id: ModuleDefinition.fields.id,
  title: ModuleDefinition.fields.title,
  description: ModuleDefinition.fields.description,
  visibility: Schema.requiredKey(ModuleDefinition.fields.visibility.schema),
  dependencies: ModuleDefinition.fields.dependencies,
  implies: Schema.requiredKey(ModuleDefinition.fields.implies.schema),
  children: Schema.requiredKey(ModuleDefinition.fields.children.schema),
});

export const RecipeBuilderCatalog = Schema.Struct({
  targets: Schema.Array(
    Schema.Struct({
      kind: TargetDefinition.fields.kind,
      title: TargetDefinition.fields.title,
      description: TargetDefinition.fields.description,
      defaultName: TargetDefinition.fields.defaultName,
      requiredModules: Schema.requiredKey(
        TargetDefinition.fields.requiredModules.schema,
      ),
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
    payload: RecipePreviewInput.fields,
    success: RecipePreview,
    error: RecipeBuilderRpcFailure,
  }),
  Rpc.make("catalog", {
    payload: { owners: Schema.Array(TargetIdentity) },
    success: RecipeBuilderCatalog,
    error: RecipeBuilderRpcFailure,
  }),
) {}
