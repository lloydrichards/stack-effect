import { describe, expect, it } from "vitest";
import { moduleRegistry } from "./moduleRegistry";

describe("moduleRegistry", () => {
  const knownIds = new Set(moduleRegistry.map((m) => m.id));

  it("should have unique module ids", () => {
    const ids = moduleRegistry.map((m) => m.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  it("should only reference existing modules in dependencies", () => {
    const missing: Array<{ module: string; references: string }> = [];

    for (const mod of moduleRegistry) {
      for (const dep of mod.dependencies) {
        if (dep.requiredModule && !knownIds.has(dep.requiredModule.moduleId)) {
          missing.push({
            module: mod.id,
            references: dep.requiredModule.moduleId,
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("should only reference existing modules in implies", () => {
    const missing: Array<{ module: string; references: string }> = [];

    for (const mod of moduleRegistry) {
      for (const imp of mod.implies ?? []) {
        if (!knownIds.has(imp.moduleId)) {
          missing.push({
            module: mod.id,
            references: imp.moduleId,
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
