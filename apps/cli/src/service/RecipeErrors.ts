import {
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Schema } from "effect";

export const RecipeProviderStrategy = Schema.TaggedUnion({
  "fail-on-ambiguous": {},
  "first-provider": {},
  explicit: {
    providers: Schema.Array(
      Schema.Struct({
        target: TargetIdentity,
        capability: ModuleCapability,
        moduleId: ModuleId,
      }),
    ),
  },
});

export type RecipeProviderStrategy = typeof RecipeProviderStrategy.Type;

export const RecipeResolveOptions = Schema.Struct({
  config: StackConfig,
  providerStrategy: RecipeProviderStrategy,
});

export type RecipeResolveOptions = typeof RecipeResolveOptions.Type;

export class InvalidRecipeSpec extends Schema.TaggedErrorClass<InvalidRecipeSpec>()(
  "InvalidRecipeSpec",
  {
    issues: Schema.Array(
      Schema.Struct({
        path: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
        message: Schema.String,
      }),
    ),
  },
) {
  override get message(): string {
    return `Invalid recipe: ${this.issues.map((issue) => issue.message).join("; ")}`;
  }
}

export class MissingRecipeProvider extends Schema.TaggedErrorClass<MissingRecipeProvider>()(
  "MissingRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, but no compatible provider module exists.`;
  }
}

export class AmbiguousRecipeProvider extends Schema.TaggedErrorClass<AmbiguousRecipeProvider>()(
  "AmbiguousRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
    providers: Schema.Array(
      Schema.Struct({
        moduleId: ModuleId,
        title: Schema.String,
        description: Schema.String,
      }),
    ),
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, but multiple providers are available: ${this.providers
      .map((provider) => provider.moduleId)
      .join(
        ", ",
      )}. Add the intended provider explicitly or use an interactive command that can choose one.`;
  }
}

export class UnresolvedRecipeTarget extends Schema.TaggedErrorClass<UnresolvedRecipeTarget>()(
  "UnresolvedRecipeTarget",
  {
    requestingModuleId: ModuleId,
    targetKind: TargetKind,
    reason: Schema.Literals(["missing", "ambiguous"]),
    candidates: Schema.Array(TargetIdentity),
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires a ${this.targetKind} target, but the recipe target could not be resolved.`;
  }
}

export type RecipeError =
  | InvalidRecipeSpec
  | MissingRecipeProvider
  | AmbiguousRecipeProvider
  | UnresolvedRecipeTarget;
