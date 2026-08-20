import { encodeRecipeTargetSpecs, RecipeTargetString } from "@repo/scaffold";
import { Array as Arr, Option, Schema } from "effect";
import {
  initialRecipeBuilderValues,
  RecipeBuilderFormSchema,
  type RecipeBuilderFormValues,
  type TargetInstance,
  toRecipePreviewInput,
} from "./form";

const defaults = initialRecipeBuilderValues.config;

const RecipeUrlSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  target: Schema.Array(RecipeTargetString),
  runtime: Schema.optional(Schema.Literals(["bun", "node"])),
  packageManager: Schema.optional(Schema.Literals(["bun", "pnpm", "npm"])),
  typescript: Schema.optional(Schema.Literals(["6", "7"])),
  monorepo: Schema.optional(Schema.String),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  noGit: Schema.Boolean,
}).check(
  Schema.makeFilter(({ runtime, packageManager }) =>
    (runtime === "bun" &&
      packageManager !== undefined &&
      packageManager !== "bun") ||
    (runtime === "node" && packageManager === "bun")
      ? "Runtime and package manager conflict."
      : undefined,
  ),
);

const scalarRecipeParameters = [
  "name",
  "runtime",
  "package-manager",
  "typescript",
  "monorepo",
  "lint",
  "format",
  "test",
  "no-git",
] as const;

const knownRecipeParameters = new Set([...scalarRecipeParameters, "target"]);

const decodeUrl = Schema.decodeUnknownOption(RecipeUrlSchema);

const invalidRecipeUrl = {
  issue:
    "This shared recipe URL is invalid. Fix its query parameters before using it.",
} as const;

type ValidRecipeUrl = {
  readonly initialValues: RecipeBuilderFormValues;
  readonly issue: undefined;
};

type InvalidRecipeUrl = {
  readonly initialValues: RecipeBuilderFormValues;
  readonly issue: string;
};

export type DecodedRecipeUrl = ValidRecipeUrl | InvalidRecipeUrl;

const mergeTargets = (targets: ReadonlyArray<typeof RecipeTargetString.Type>) =>
  Arr.fromIterable(
    targets
      .reduce((merged, spec) => {
        const key = spec.target.toKey();
        const existing = merged.get(key);
        merged.set(key, {
          target: spec.target,
          modules: Arr.dedupe([...(existing?.modules ?? []), ...spec.modules]),
        });
        return merged;
      }, new Map<string, typeof RecipeTargetString.Type>())
      .values(),
  );

const toInitialValues = (
  recipe: typeof RecipeUrlSchema.Type,
): RecipeBuilderFormValues | undefined => {
  const packageManager = recipe.packageManager ?? "bun";
  const runtime = recipe.runtime ?? (packageManager === "bun" ? "bun" : "node");
  const config = {
    name: recipe.name ?? defaults.name,
    runtime:
      runtime === "bun"
        ? ({ _tag: "bun" } as const)
        : ({
            _tag: "node" as const,
            packageManager: packageManager === "npm" ? "npm" : "pnpm",
          } as const),
    typescript: recipe.typescript ?? defaults.typescript,
    monorepo: recipe.monorepo ?? defaults.monorepo,
    lint: recipe.lint ?? defaults.lint,
    format: recipe.format ?? defaults.format,
    test: recipe.test ?? defaults.test,
  };
  const targets = mergeTargets(recipe.target);
  const workspaceTargets = targets.filter(
    (target) => target.target.kind === "workspace",
  );
  if (workspaceTargets.some((target) => target.target.name !== config.name)) {
    return undefined;
  }
  const workspaceModules = Arr.dedupe(
    workspaceTargets.flatMap((target) => target.modules.map(String)),
  );
  const databaseModules = Arr.dedupe(
    targets
      .filter(
        (target) =>
          target.target.kind === "package" && target.target.name === "db",
      )
      .flatMap((target) => target.modules.map(String))
      .filter(
        (module) =>
          module === "package-db-sqlite" || module === "package-db-postgres",
      ),
  );
  if (databaseModules.length > 1) return undefined;
  const database =
    databaseModules[0] === "package-db-sqlite"
      ? ("sqlite" as const)
      : databaseModules[0] === "package-db-postgres"
        ? ("postgres" as const)
        : ("none" as const);
  if (recipe.noGit && workspaceModules.includes("workspace-devenv-git")) {
    return undefined;
  }
  const formTargets: ReadonlyArray<TargetInstance> = targets
    .filter((target) => target.target.kind !== "workspace")
    .flatMap((target, index) => {
      const modules = target.modules
        .map(String)
        .filter(
          (module) =>
            module !== "package-db-sqlite" && module !== "package-db-postgres",
        );
      return modules.length === 0 &&
        target.target.kind === "package" &&
        target.target.name === "db"
        ? []
        : [
            {
              id: `url-${target.target.kind}-${target.target.name || "default"}-${index + 1}`,
              kind: target.target.kind,
              name: target.target.name,
              modules,
            },
          ];
    });
  const decoded = Schema.decodeOption(RecipeBuilderFormSchema)({
    config,
    database,
    gitEnabled: !recipe.noGit,
    developerExperienceModules: workspaceModules.filter(
      (module) => module !== "workspace-devenv-git",
    ),
    targets: formTargets,
    supportSelections: [],
  });

  return Option.getOrUndefined(decoded);
};

const hasDuplicateModules = (
  targets: ReadonlyArray<typeof RecipeTargetString.Type>,
) =>
  targets.some(
    (target) =>
      new Set(target.modules.map(String)).size !== target.modules.length,
  );

export const decodeRecipeBuilderUrl = (
  searchParams: URLSearchParams,
): DecodedRecipeUrl => {
  if ([...searchParams.keys()].some((key) => !knownRecipeParameters.has(key))) {
    return { ...invalidRecipeUrl, initialValues: initialRecipeBuilderValues };
  }
  if (
    scalarRecipeParameters.some((key) => searchParams.getAll(key).length > 1)
  ) {
    return { ...invalidRecipeUrl, initialValues: initialRecipeBuilderValues };
  }
  const decoded = decodeUrl({
    name: searchParams.get("name") ?? undefined,
    target: searchParams.getAll("target"),
    runtime: searchParams.get("runtime") ?? undefined,
    packageManager: searchParams.get("package-manager") ?? undefined,
    typescript: searchParams.get("typescript") ?? undefined,
    monorepo: searchParams.get("monorepo") ?? undefined,
    lint: searchParams.get("lint") ?? undefined,
    format: searchParams.get("format") ?? undefined,
    test: searchParams.get("test") ?? undefined,
    noGit: searchParams.has("no-git"),
  });
  if (Option.isNone(decoded)) {
    return { ...invalidRecipeUrl, initialValues: initialRecipeBuilderValues };
  }
  if (hasDuplicateModules(decoded.value.target)) {
    return { ...invalidRecipeUrl, initialValues: initialRecipeBuilderValues };
  }
  const initialValues = toInitialValues(decoded.value);
  return initialValues === undefined
    ? { ...invalidRecipeUrl, initialValues: initialRecipeBuilderValues }
    : { initialValues, issue: undefined };
};

export const encodeRecipeBuilderUrl = (
  values: RecipeBuilderFormValues,
): URLSearchParams => {
  const params = new URLSearchParams();
  const previewInput = toRecipePreviewInput(values);
  const targets = previewInput.recipe.targets.flatMap((target) =>
    target.target.kind === "workspace"
      ? [
          {
            target: target.target,
            modules: target.modules.filter(
              (module) => module !== "workspace-devenv-git",
            ),
          },
        ].filter((target) => target.modules.length > 0)
      : [{ target: target.target, modules: target.modules }],
  );

  params.set("name", values.config.name);
  encodeRecipeTargetSpecs(targets)
    .sort()
    .forEach((target) => params.append("target", target));
  if (values.config.runtime._tag === "node") {
    params.set("runtime", "node");
    params.set("package-manager", values.config.runtime.packageManager);
  }
  if (values.config.typescript !== defaults.typescript) {
    params.set("typescript", values.config.typescript ?? "6");
  }
  (["monorepo", "lint", "format", "test"] as const).forEach((field) => {
    const value = values.config[field];
    if (value !== undefined && value !== defaults[field])
      params.set(field, value);
  });
  if (!values.gitEnabled) params.set("no-git", "");
  return params;
};
