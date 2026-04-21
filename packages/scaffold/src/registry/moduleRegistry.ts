import type { RepoModuleId } from "@repo/domain/Scaffold";
import type { RepoModuleDefinition } from "../catalog/ModuleCatalog";

export const moduleRegistry = new Map<
  typeof RepoModuleId.Type,
  RepoModuleDefinition
>([["root-bootstrap", { moduleId: "root-bootstrap" }]]);
