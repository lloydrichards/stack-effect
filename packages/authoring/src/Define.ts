import type {
  Contribution,
  ModuleDefinition,
  TargetDefinition,
} from "@repo/domain/Catalog";
import type { TemplateRef } from "./Template";

type WithTemplates<C> = C extends unknown
  ? { readonly [K in keyof C]: string extends C[K] ? C[K] | TemplateRef : C[K] }
  : never;

/** A Contribution whose free-text fields may point at a template file. */
export type ContributionInput = WithTemplates<typeof Contribution.Encoded>;

/** A module definition in its JSON shape, with template-backed contributions. */
export type ModuleInput = Omit<
  typeof ModuleDefinition.Encoded,
  "contributions"
> & { readonly contributions: ReadonlyArray<ContributionInput> };

/** A target definition in its JSON shape, with template-backed contributions. */
export type TargetInput = Omit<
  typeof TargetDefinition.Encoded,
  "contributions"
> & { readonly contributions: ReadonlyArray<ContributionInput> };

/** Definitions declared in one source file, which errors and provenance name. */
export interface DefinitionGroup<A> {
  readonly source: string;
  readonly definitions: ReadonlyArray<A>;
}

export interface CatalogInput {
  readonly targets: ReadonlyArray<DefinitionGroup<TargetInput>>;
  readonly modules: ReadonlyArray<DefinitionGroup<ModuleInput>>;
}

/** Group modules under their source file; pass `import.meta.url`. */
export const defineModules = (
  source: URL | string,
  definitions: ReadonlyArray<ModuleInput>,
): DefinitionGroup<ModuleInput> => ({
  source: String(source),
  definitions,
});

/** Group targets under their source file; pass `import.meta.url`. */
export const defineTargets = (
  source: URL | string,
  definitions: ReadonlyArray<TargetInput>,
): DefinitionGroup<TargetInput> => ({
  source: String(source),
  definitions,
});
