export type {
  CatalogIssueCode,
  CatalogIssueSubject,
  CatalogDocument,
} from "@repo/domain/Catalog";
export {
  buildCatalog,
  CatalogBuildError,
  type BuildCatalogOptions,
  type BuildCatalogResult,
  type CatalogBuildIssue,
  type CatalogBuildIssueCode,
  type DefinitionProvenance,
  type TemplateProvenance,
} from "./buildCatalog";
export {
  defineModules,
  defineTargets,
  type CatalogInput,
  type ContributionInput,
  type DefinitionGroup,
  type ModuleInput,
  type TargetInput,
} from "./Define";
export { isTemplateRef, templates, type TemplateRef } from "./Template";
