import { TargetIdentity } from "@repo/domain/Catalog";
import {
  RecipePreviewInputSchema,
  RecipePreviewSchema,
} from "@repo/scaffold/recipe-preview";
import { Schema } from "effect";

export const RecipePreviewInputWire = Schema.toEncoded(
  RecipePreviewInputSchema,
);

const TargetIdentityWire = Schema.toEncoded(TargetIdentity);

const ModuleDependencyWire = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("required-target"),
    identity: TargetIdentityWire,
  }),
  Schema.Struct({
    _tag: Schema.Literal("required-module"),
    target: TargetIdentityWire,
    moduleId: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("required-capability"),
    target: TargetIdentityWire,
    capability: Schema.String,
  }),
]);

export const RecipePreviewOutputWire = Schema.toEncoded(RecipePreviewSchema);

export type RecipePreviewInputWire = typeof RecipePreviewInputWire.Type;
export type RecipePreviewOutputWire = typeof RecipePreviewOutputWire.Type;

export const BuilderCatalogRequestSchema = Schema.Struct({
  owners: Schema.Array(TargetIdentity),
});

export const BuilderCatalogRequestWire = Schema.toEncoded(
  BuilderCatalogRequestSchema,
);

const ModuleChoiceWire = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
});

const ConfigurationChoiceWire = Schema.Struct({
  ...ModuleChoiceWire.fields,
  value: Schema.String,
});

export const BuilderCatalogOutputWire = Schema.Struct({
  targets: Schema.Array(
    Schema.Struct({
      kind: Schema.String,
      title: Schema.String,
      description: Schema.String,
      defaultName: Schema.optional(Schema.String),
      requiredModules: Schema.Array(Schema.String),
    }),
  ),
  targetModules: Schema.Array(
    Schema.Struct({
      owner: TargetIdentityWire,
      modules: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          title: Schema.String,
          description: Schema.String,
          visibility: Schema.Literals(["public", "internal"]),
          dependencies: Schema.Array(ModuleDependencyWire),
          implications: Schema.Array(
            Schema.Struct({
              targetKind: Schema.String,
              moduleId: Schema.String,
            }),
          ),
          children: Schema.Array(
            Schema.Struct({
              requirement: Schema.Literals(["required", "optional"]),
              moduleId: Schema.String,
            }),
          ),
        }),
      ),
    }),
  ),
  configuration: Schema.Struct({
    monorepo: Schema.Array(ConfigurationChoiceWire),
    lint: Schema.Array(ConfigurationChoiceWire),
    format: Schema.Array(ConfigurationChoiceWire),
    test: Schema.Array(ConfigurationChoiceWire),
    developerExperience: Schema.Array(ModuleChoiceWire),
  }),
});

export type BuilderCatalogRequestWire = typeof BuilderCatalogRequestWire.Type;
export type BuilderCatalogOutputWire = typeof BuilderCatalogOutputWire.Type;
