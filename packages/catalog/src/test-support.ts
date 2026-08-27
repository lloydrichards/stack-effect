import type { ModuleDefinition } from "@repo/domain/Catalog";
import { moduleRegistry } from "./registry/moduleRegistry";

/** Mutable catalog fixture seam for isolated service tests. Never use in production code. */
export const catalogTestModuleRegistry = moduleRegistry as Array<
  typeof ModuleDefinition.Type
>;
