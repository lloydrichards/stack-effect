import {
  ArchitectureId,
  ClassicArchitecture,
  ModuleDefinition,
  TargetDefinition,
  TargetIdentity,
} from "@repo/domain/Catalog";
import {
  RecipePreview,
  RecipePreviewInput,
} from "@repo/scaffold/recipe-preview";
import { Effect, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

const ContributionDescriptor = Schema.Struct({
  _tag: Schema.Literals([
    "file",
    "pkg-json-entry",
    "json-array-entry",
    "yaml-sequence-entry",
    "barrel-export",
    "ts-call-arg",
    "ts-object-field",
    "jsx-slot",
  ]),
  path: Schema.String,
  field: Schema.optional(Schema.String),
});

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
  architecture: ArchitectureId.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed(ClassicArchitecture)),
  ),
  supportedOn: ModuleDefinition.fields.supportedOn.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  dependencies: ModuleDefinition.fields.dependencies,
  implies: Schema.requiredKey(ModuleDefinition.fields.implies.schema),
  contributions: Schema.Array(ContributionDescriptor).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  children: Schema.requiredKey(ModuleDefinition.fields.children.schema),
  supportedArchitectures: Schema.Array(ArchitectureId).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([ClassicArchitecture])),
  ),
  availability: Schema.Union([
    Schema.Struct({ enabled: Schema.Literal(true) }),
    Schema.Struct({
      enabled: Schema.Literal(false),
      code: Schema.Literals(["unsupported-architecture", "unsupported-owner"]),
      reason: Schema.String,
      action: Schema.String,
    }),
  ]).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed({ enabled: true as const })),
  ),
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
      supportedArchitectures: Schema.Array(ArchitectureId).pipe(
        Schema.optionalKey,
        Schema.withConstructorDefault(Effect.succeed([ClassicArchitecture])),
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
    payload: {
      owners: Schema.Array(TargetIdentity),
      architecture: Schema.optional(ArchitectureId),
    },
    success: RecipeBuilderCatalog,
    error: RecipeBuilderRpcFailure,
  }),
) {}
