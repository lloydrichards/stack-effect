import {
  ModuleId,
  TargetIdentity,
  TargetKind,
  TargetName,
  CatalogSources,
  selectsOfficialCatalog,
} from "@repo/domain/Catalog";
import type { RecipePreviewInput } from "@repo/domain/Recipe";
import {
  Runtime,
  STACK_CONFIG_SCHEMA_URL,
  StackConfig,
  StackConfigDefaults,
} from "@repo/domain/StackConfig";
import { useForm } from "@tanstack/react-form";
import { Array as Arr, Context, Option, Schema } from "effect";

export const ProjectName = Schema.String.check(
  Schema.makeFilter((name) => {
    if (name.trim().length === 0) return "Enter a project name.";
    return (
      Schema.is(TargetName)(name) ||
      "Use a project name with safe, non-empty directory segments."
    );
  }),
);

const KebabTargetName = TargetName.check(
  Schema.isPattern(
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/,
    {
      message:
        "Use lowercase letters, numbers, and single hyphens; separate folders with /.",
    },
  ),
);

/** Absent sources mean the official catalog only, as in `stack.effect.json`. */
export const usesOfficialCatalog = (
  catalogs: CatalogSources | undefined,
): boolean => catalogs === undefined || selectsOfficialCatalog(catalogs);

const StackConfiguration = Schema.Struct({
  name: ProjectName,
  runtime: Runtime,
  typescript: Schema.optional(Schema.Literals(["6", "7"])),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  monorepo: Schema.optional(Schema.String),
  /** Absent selects the official catalog only, as in `stack.effect.json`. */
  catalogs: Schema.optional(CatalogSources),
});

const TargetModuleRequirement = Schema.Struct({
  sourceTargetId: Schema.String,
  sourceModuleId: Schema.String,
  moduleId: Schema.String,
  addedModule: Schema.Boolean,
});

export type TargetModuleRequirement = typeof TargetModuleRequirement.Type;

const TargetInstance = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  name: KebabTargetName,
  modules: Schema.Array(Schema.String),
  requirements: Schema.optional(Schema.Array(TargetModuleRequirement)),
  addedByDependency: Schema.optional(Schema.Boolean),
});

export type TargetInstance = typeof TargetInstance.Type;

export const ownerKey = (owner: {
  readonly kind: string;
  readonly name: string;
}): string => `${owner.kind}/${owner.name}`;

export const resolvedOwnerKey = (
  owner: Parameters<typeof ownerKey>[0],
  defaultName?: string,
): string =>
  Option.match(Schema.decodeOption(TargetIdentity)(owner), {
    onNone: () => ownerKey(owner),
    onSome: (identity) => identity.withDefaultName(defaultName).toKey(),
  });

export type SupportConfiguration = {
  readonly owner: { readonly kind: string; readonly name: string };
  readonly parentId: string;
};

const SupportSelection = Schema.Struct({
  owner: Schema.Struct({ kind: Schema.String, name: Schema.String }),
  parentId: Schema.String,
  selected: Schema.Array(Schema.String),
});

export type SupportSelection = typeof SupportSelection.Type;

const RecipeBuilderFormFields = Schema.Struct({
  config: StackConfiguration,
  database: Schema.Literals(["none", "sqlite", "postgres"]),
  gitEnabled: Schema.Boolean,
  developerExperienceModules: Schema.Array(Schema.String),
  targets: Schema.Array(TargetInstance),
  supportSelections: Schema.Array(SupportSelection),
});

export const RecipeBuilderFormValues = RecipeBuilderFormFields.check(
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

export type RecipeBuilderFormValues = typeof RecipeBuilderFormValues.Type;

const recipeBuilderFormValidator = Schema.toStandardSchemaV1(
  Schema.toType(RecipeBuilderFormValues),
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

export const useRecipeBuilderForm = (
  initialValues: RecipeBuilderFormValues = initialRecipeBuilderValues,
) => {
  return useForm({
    defaultValues: initialValues,
    validators: { onChange: recipeBuilderFormValidator },
  });
};

export type RecipeBuilderFormApi = ReturnType<typeof useRecipeBuilderForm>;

/**
 * Tool, database, and Git controls pick official modules, so a selection
 * without the official catalog drops them, as a custom-only CLI config does.
 */
const withoutOfficialChoices = (
  values: RecipeBuilderFormValues,
): RecipeBuilderFormValues => {
  const {
    monorepo: _monorepo,
    lint: _lint,
    format: _format,
    test: _test,
    ...config
  } = values.config;
  return {
    ...values,
    config,
    database: "none",
    gitEnabled: false,
    developerExperienceModules: [],
  };
};

export const toRecipePreviewInput = (
  formValues: RecipeBuilderFormValues,
): RecipePreviewInput => {
  const values = usesOfficialCatalog(formValues.config.catalogs)
    ? formValues
    : withoutOfficialChoices(formValues);
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
    config: new StackConfig({
      ...values.config,
      monorepo: values.config.monorepo || undefined,
      lint: values.config.lint || undefined,
      format: values.config.format || undefined,
      test: values.config.test || undefined,
      $schema: STACK_CONFIG_SCHEMA_URL,
    }),
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
};
