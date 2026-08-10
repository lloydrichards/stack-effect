import type { StandardSchemaV1 } from "@standard-schema/spec";
import { useForm } from "@tanstack/react-form";
import { Array as Arr, Schema } from "effect";
import {
  CatalogModuleWire,
  type RecipePreviewInputWire,
} from "../../worker/recipe-preview-protocol";

const RuntimeSchema = Schema.TaggedUnion({
  bun: {},
  node: {
    packageManager: Schema.Literals(["pnpm", "npm"]),
  },
});

const ProjectNameSchema = Schema.String.check(
  Schema.makeFilter((name) =>
    name.trim().length > 0 ? undefined : "Enter a project name.",
  ),
);

const TargetNameSchema = Schema.String.check(
  Schema.isPattern(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/, {
    message: "Use lowercase letters, numbers, and single hyphens.",
  }),
);

export const StackConfigurationSchema = Schema.Struct({
  name: ProjectNameSchema,
  runtime: RuntimeSchema,
  typescript: Schema.optional(Schema.Literals(["6", "7"])),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
});

export interface StackConfiguration
  extends Schema.Schema.Type<typeof StackConfigurationSchema> {}

export const TargetModuleRequirementSchema = Schema.Struct({
  sourceTargetId: Schema.String,
  sourceModuleId: Schema.String,
  moduleId: Schema.String,
  addedModule: Schema.Boolean,
});

export interface TargetModuleRequirement
  extends Schema.Schema.Type<typeof TargetModuleRequirementSchema> {}

export const TargetInstanceSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  name: TargetNameSchema,
  modules: Schema.Array(Schema.String),
  requirements: Schema.optional(Schema.Array(TargetModuleRequirementSchema)),
  addedByDependency: Schema.optional(Schema.Boolean),
});

export interface TargetInstance
  extends Schema.Schema.Type<typeof TargetInstanceSchema> {}

export type CatalogModule = typeof CatalogModuleWire.Type;

export type SupportConfiguration = {
  readonly owner: { readonly kind: string; readonly name: string };
  readonly parent: CatalogModule;
  readonly modules: ReadonlyArray<CatalogModule>;
};

export const SupportSelectionSchema = Schema.Struct({
  owner: Schema.Struct({ kind: Schema.String, name: Schema.String }),
  parent: CatalogModuleWire,
  modules: Schema.Array(CatalogModuleWire),
  selected: Schema.Array(Schema.String),
});

export interface SupportSelection
  extends Schema.Schema.Type<typeof SupportSelectionSchema> {}

const RecipeBuilderFormFields = Schema.Struct({
  config: StackConfigurationSchema,
  gitEnabled: Schema.Boolean,
  developerExperienceModules: Schema.Array(Schema.String),
  targets: Schema.Array(TargetInstanceSchema),
  supportSelections: Schema.Array(SupportSelectionSchema),
});

export const RecipeBuilderFormSchema = RecipeBuilderFormFields.check(
  Schema.makeFilter(({ targets }) =>
    targets.flatMap((target, index) =>
      targets.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.kind === target.kind &&
          candidate.name === target.name,
      )
        ? [
            {
              path: ["targets", index, "name"],
              issue: "Target names must be unique within a target kind.",
            },
          ]
        : [],
    ),
  ),
);

export interface RecipeBuilderFormValues
  extends Schema.Schema.Type<typeof RecipeBuilderFormSchema> {}

export const recipeBuilderFormValidator: StandardSchemaV1<
  RecipeBuilderFormValues,
  RecipeBuilderFormValues
> = Schema.toStandardSchemaV1(RecipeBuilderFormSchema);

export const initialRecipeBuilderValues: RecipeBuilderFormValues = {
  config: {
    name: "my-effect-app",
    runtime: { _tag: "bun" },
    typescript: "6",
    monorepo: "turbo",
    lint: "biome",
    format: "biome",
    test: "vitest",
  },
  gitEnabled: true,
  developerExperienceModules: [],
  targets: [],
  supportSelections: [],
};

export function useRecipeBuilderForm() {
  return useForm({
    defaultValues: initialRecipeBuilderValues,
    validators: { onChange: recipeBuilderFormValidator },
  });
}

export type RecipeBuilderFormApi = ReturnType<typeof useRecipeBuilderForm>;

const targetKey = (target: { readonly kind: string; readonly name: string }) =>
  `${target.kind}/${target.name}`;

export function toRecipePreviewInput(
  values: RecipeBuilderFormValues,
): RecipePreviewInputWire {
  const supportTargets: ReadonlyArray<TargetInstance> =
    values.supportSelections.flatMap((selection) =>
      selection.selected.length > 0
        ? [
            {
              id: `support-${targetKey(selection.owner)}`,
              ...selection.owner,
              modules: [selection.parent.id, ...selection.selected],
            },
          ]
        : [],
    );
  const targets = Arr.fromIterable(
    [...values.targets, ...supportTargets]
      .reduce((merged, target) => {
        const key = targetKey(target);
        const existing = merged.get(key);
        merged.set(key, {
          ...target,
          modules: existing
            ? Arr.dedupe([...existing.modules, ...target.modules])
            : target.modules,
        });
        return merged;
      }, new Map<string, TargetInstance>())
      .values(),
  );

  return {
    config: values.config,
    recipe: {
      targets: [
        ...(values.gitEnabled || values.developerExperienceModules.length > 0
          ? [
              {
                target: { kind: "workspace", name: values.config.name },
                modules: [
                  ...(values.gitEnabled ? ["workspace-devenv-git"] : []),
                  ...values.developerExperienceModules,
                ],
              },
            ]
          : []),
        ...targets.map((target) => ({
          target: { kind: target.kind, name: target.name },
          modules: target.modules,
        })),
      ],
    },
  };
}
