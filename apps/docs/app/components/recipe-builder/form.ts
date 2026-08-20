import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { StackConfigDefaults } from "@repo/scaffold/browser";
import type { RecipePreviewInput } from "@repo/scaffold/recipe-preview";
import { useForm } from "@tanstack/react-form";
import { Array as Arr, Context, Schema } from "effect";

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

const StackConfigurationSchema = Schema.Struct({
  name: ProjectNameSchema,
  runtime: RuntimeSchema,
  typescript: Schema.optional(Schema.Literals(["6", "7"])),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
});

const TargetModuleRequirementSchema = Schema.Struct({
  sourceTargetId: Schema.String,
  sourceModuleId: Schema.String,
  moduleId: Schema.String,
  addedModule: Schema.Boolean,
});

export interface TargetModuleRequirement
  extends Schema.Schema.Type<typeof TargetModuleRequirementSchema> {}

const TargetInstanceSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  name: TargetNameSchema,
  modules: Schema.Array(Schema.String),
  requirements: Schema.optional(Schema.Array(TargetModuleRequirementSchema)),
  addedByDependency: Schema.optional(Schema.Boolean),
});

export interface TargetInstance
  extends Schema.Schema.Type<typeof TargetInstanceSchema> {}

export const ownerKey = (owner: {
  readonly kind: string;
  readonly name: string;
}): string => `${owner.kind}/${owner.name}`;

export type SupportConfiguration = {
  readonly owner: { readonly kind: string; readonly name: string };
  readonly parentId: string;
};

const SupportSelectionSchema = Schema.Struct({
  owner: Schema.Struct({ kind: Schema.String, name: Schema.String }),
  parentId: Schema.String,
  selected: Schema.Array(Schema.String),
});

export interface SupportSelection
  extends Schema.Schema.Type<typeof SupportSelectionSchema> {}

const RecipeBuilderFormFields = Schema.Struct({
  config: StackConfigurationSchema,
  database: Schema.Literals(["none", "sqlite", "postgres"]),
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

const recipeBuilderFormValidator = Schema.toStandardSchemaV1(
  Schema.toType(RecipeBuilderFormSchema),
);

const stackConfigDefaults = Context.get(Context.empty(), StackConfigDefaults);

export const initialRecipeBuilderValues: RecipeBuilderFormValues = {
  config: {
    name: "my-effect-app",
    runtime: stackConfigDefaults.runtime,
    typescript: stackConfigDefaults.typescript,
    monorepo: stackConfigDefaults.monorepo,
    lint: stackConfigDefaults.lint,
    format: stackConfigDefaults.format,
    test: stackConfigDefaults.test,
  },
  database: "none",
  gitEnabled: true,
  developerExperienceModules: [],
  targets: [],
  supportSelections: [],
};

export function useRecipeBuilderForm(
  initialValues: RecipeBuilderFormValues = initialRecipeBuilderValues,
) {
  return useForm({
    defaultValues: initialValues,
    validators: { onChange: recipeBuilderFormValidator },
  });
}

export type RecipeBuilderFormApi = ReturnType<typeof useRecipeBuilderForm>;

export function toRecipePreviewInput(
  values: RecipeBuilderFormValues,
): RecipePreviewInput {
  const supportTargets: ReadonlyArray<TargetInstance> =
    values.supportSelections.flatMap((selection) =>
      selection.selected.length > 0
        ? [
            {
              id: `support-${ownerKey(selection.owner)}`,
              ...selection.owner,
              modules: [selection.parentId, ...selection.selected],
            },
          ]
        : [],
    );
  const databaseTargets: ReadonlyArray<TargetInstance> =
    values.database === "none"
      ? []
      : [
          {
            id: "database",
            kind: "package",
            name: "db",
            modules: [`package-db-${values.database}`],
          },
        ];
  const targets = Arr.fromIterable(
    [...values.targets, ...supportTargets, ...databaseTargets]
      .reduce((merged, target) => {
        const key = ownerKey(target);
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
    config: new StackConfig(values.config),
    recipe: {
      targets: [
        ...(values.gitEnabled || values.developerExperienceModules.length > 0
          ? [
              {
                target: new TargetIdentity({
                  kind: TargetKind.make("workspace"),
                  name: values.config.name,
                }),
                modules: [
                  ...(values.gitEnabled
                    ? [ModuleId.make("workspace-devenv-git")]
                    : []),
                  ...values.developerExperienceModules.map((id) =>
                    ModuleId.make(id),
                  ),
                ],
              },
            ]
          : []),
        ...targets.map((target) => ({
          target: new TargetIdentity({
            kind: TargetKind.make(target.kind),
            name: target.name,
          }),
          modules: target.modules.map((id) => ModuleId.make(id)),
        })),
      ],
    },
  };
}
