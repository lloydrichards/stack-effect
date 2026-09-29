export {
  CatalogIssueSubject,
  type CatalogDocument,
  type CatalogIssueCode,
} from "@repo/domain/Catalog";
export {
  buildCatalog,
  CatalogBuildError,
  CatalogBuildIssue,
  CatalogBuildIssueCode,
  DefinitionProvenance,
  TemplateProvenance,
  type BuildCatalogOptions,
  type BuildCatalogResult,
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
export {
  loadOfficialCatalog,
  OFFICIAL_CATALOG_URL,
  OfficialCatalogUnavailable,
} from "./official";
