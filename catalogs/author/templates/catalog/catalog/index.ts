import type {
  CatalogInput,
  DefinitionGroup,
  ModuleInput,
  TargetInput,
} from "@stack-effect/author";

/** The ID diagnostics name this catalog by. */
export const catalogId = "{{projectName}}";

/** Every definition source and template file must live inside this directory. */
export const root = new URL("../", import.meta.url);

// NOTE: Modules append their definition groups to these calls.
const targets = Array.of<DefinitionGroup<TargetInput>>();
const modules = Array.of<DefinitionGroup<ModuleInput>>();

export const catalog: CatalogInput = { targets, modules };
