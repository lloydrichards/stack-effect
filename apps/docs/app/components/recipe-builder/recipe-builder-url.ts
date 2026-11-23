import {
  CatalogSources,
  formatCatalogSource,
  OFFICIAL_CATALOG_SOURCE,
} from "@repo/domain/CatalogSource";
import { makeRuntime, runtimeForPackageManager } from "@repo/domain/Scaffold";
import {
  encodeRecipeTargetSpecs,
  RecipeTargetString,
} from "@repo/scaffold/RecipeTargets";
import { defaultsForRuntime } from "@repo/scaffold/StackConfigDefaults";
import { Array as Arr, Option, Schema } from "effect";
import {
  initialRecipeBuilderValues,
  ownerKey,
  RecipeBuilderFormValues,
  type TargetInstance,
  toRecipePreviewInput,
  usesOfficialCatalog,
} from "./form";

const defaults = initialRecipeBuilderValues.config;

const RecipeUrl = Schema.Struct({
  name: Schema.optional(Schema.String),
  target: Schema.Array(RecipeTargetString),
  dependencies: Schema.Array(
    Schema.fromJsonString(
      Schema.Struct({
        from: Schema.String,
        module: Schema.String,
        to: Schema.String,
        requires: Schema.String,
        addedTarget: Schema.Boolean,
        addedModule: Schema.Boolean,
      }),
    ),
  ),
  runtime: Schema.optional(Schema.Literals(["bun", "deno", "node"])),
  packageManager: Schema.optional(
    Schema.Literals(["bun", "deno", "pnpm", "npm"]),
  ),
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
    (runtime === "deno" &&
      packageManager !== undefined &&
      packageManager !== "deno") ||
    (runtime === "node" &&
      (packageManager === "bun" || packageManager === "deno"))
      ? "Runtime and package manager conflict."
      : undefined,
  ),
);

type RecipeUrl = typeof RecipeUrl.Type;

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

const knownRecipeParameters = new Set([
  ...scalarRecipeParameters,
  "target",
  "catalog",
  "dependency",
]);

const decodeUrl = Schema.decodeUnknownOption(RecipeUrl);

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

const mergeTargets = (targets: ReadonlyArray<RecipeTargetString>) =>
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
      }, new Map<string, RecipeTargetString>())
      .values(),
  );

/** `official` or `<name>=<url>`, split at the first `=` as the CLI flag is. */
const parseCatalogParameter = (entry: string) => {
  const separator = entry.indexOf("=");
  return separator === -1
    ? { name: entry }
    : { name: entry.slice(0, separator), url: entry.slice(separator + 1) };
};

type DecodedCatalogs =
  | { readonly catalogs: CatalogSources | undefined; readonly issue?: never }
  | { readonly issue: string };

const decodeCatalogParameters = (
  entries: ReadonlyArray<string>,
): DecodedCatalogs => {
  if (entries.length === 0) return { catalogs: undefined };
  const decoded = Schema.decodeUnknownOption(CatalogSources)(
    entries.map(parseCatalogParameter),
  );
  if (Option.isNone(decoded))
    return {
      issue:
        'This shared recipe lists invalid catalogs. Each catalog parameter must be "official" or <name>=<https URL>, without repeats.',
    };
  // An explicit official-only list is the default set, so it is stored as absent.
  return {
    catalogs: decoded.value.every(
      (source) => source.name === OFFICIAL_CATALOG_SOURCE,
    )
      ? undefined
      : decoded.value,
  };
};

const toInitialValues = (
  recipe: RecipeUrl,
  catalogs: CatalogSources | undefined,
): RecipeBuilderFormValues | undefined => {
  const packageManager = recipe.packageManager ?? "bun";
  const runtime = recipe.runtime ?? runtimeForPackageManager(packageManager);
  if (runtime === "deno" && recipe.monorepo === "turbo") return undefined;
  const runtimeDefaults = defaultsForRuntime(defaults, runtime);
  const config = {
    name: recipe.name ?? defaults.name,
    runtime: makeRuntime(runtime, packageManager),
    typescript: recipe.typescript ?? runtimeDefaults.typescript,
    monorepo: recipe.monorepo ?? runtimeDefaults.monorepo,
    lint: recipe.lint ?? runtimeDefaults.lint,
    format: recipe.format ?? runtimeDefaults.format,
    test: recipe.test ?? runtimeDefaults.test,
    catalogs,
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
  if (
    recipe.noGit &&
    (workspaceModules.includes("workspace-devenv-git") ||
      workspaceModules.includes("workspace-devenv-husky"))
  ) {
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
  const targetsByOwner = new Map(
    formTargets.map((target) => [ownerKey(target), target]),
  );
  for (const edge of recipe.dependencies) {
    const source = targetsByOwner.get(edge.from);
    const destination = targetsByOwner.get(edge.to);
    if (
      !source?.modules.includes(edge.module) ||
      !destination?.modules.includes(edge.requires) ||
      (source.id === destination.id && edge.module === edge.requires)
    )
      return undefined;
    targetsByOwner.set(edge.to, {
      ...destination,
      addedByDependency: edge.addedTarget,
      requirements: [
        ...(destination.requirements ?? []),
        {
          sourceTargetId: source.id,
          sourceModuleId: edge.module,
          moduleId: edge.requires,
          addedModule: edge.addedModule,
        },
      ],
    });
  }
  const decoded = Schema.decodeOption(RecipeBuilderFormValues)({
    config,
    database,
    gitEnabled: !recipe.noGit,
    developerExperienceModules: workspaceModules.filter(
      (module) => module !== "workspace-devenv-git",
    ),
    targets: [...targetsByOwner.values()],
    supportSelections: [],
  });

  return Option.getOrUndefined(decoded);
};

const hasDuplicateModules = (targets: ReadonlyArray<RecipeTargetString>) =>
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
    dependencies: searchParams.getAll("dependency"),
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
  const catalogs = decodeCatalogParameters(searchParams.getAll("catalog"));
  if (catalogs.issue !== undefined) {
    return { issue: catalogs.issue, initialValues: initialRecipeBuilderValues };
  }
  const initialValues = toInitialValues(decoded.value, catalogs.catalogs);
  return initialValues === undefined
    ? { ...invalidRecipeUrl, initialValues: initialRecipeBuilderValues }
    : { initialValues, issue: undefined };
};

export const encodeRecipeBuilderUrl = (
  values: RecipeBuilderFormValues,
): URLSearchParams => {
  const runtimeDefaults = defaultsForRuntime(
    defaults,
    values.config.runtime._tag,
  );
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
  values.config.catalogs?.forEach((source) =>
    params.append("catalog", formatCatalogSource(source)),
  );
  encodeRecipeTargetSpecs(targets)
    .sort()
    .forEach((target) => params.append("target", target));
  values.targets
    .flatMap((target) =>
      (target.requirements ?? []).flatMap((requirement) => {
        const source = values.targets.find(
          ({ id }) => id === requirement.sourceTargetId,
        );
        return source?.modules.includes(requirement.sourceModuleId) &&
          target.modules.includes(requirement.moduleId)
          ? [
              JSON.stringify({
                from: ownerKey(source),
                module: requirement.sourceModuleId,
                to: ownerKey(target),
                requires: requirement.moduleId,
                addedTarget: target.addedByDependency === true,
                addedModule: requirement.addedModule,
              }),
            ]
          : [];
      }),
    )
    .sort()
    .forEach((edge) => params.append("dependency", edge));
  if (values.config.runtime._tag !== "bun") {
    params.set("runtime", values.config.runtime._tag);
    params.set(
      "package-manager",
      values.config.runtime._tag === "deno"
        ? "deno"
        : values.config.runtime.packageManager,
    );
  }
  if (values.config.typescript !== runtimeDefaults.typescript) {
    params.set("typescript", values.config.typescript ?? "6");
  }
  // Tool and Git choices name official modules, so a custom-only link has none.
  if (!usesOfficialCatalog(values.config.catalogs)) return params;
  (["monorepo", "lint", "format", "test"] as const).forEach((field) => {
    const value = values.config[field];
    const defaultValue = runtimeDefaults[field];
    if (value !== undefined && value !== defaultValue) params.set(field, value);
  });
  if (!values.gitEnabled) params.set("no-git", "");
  return params;
};
