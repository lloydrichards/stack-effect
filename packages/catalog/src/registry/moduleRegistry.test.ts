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
        if (dep._tag === "required-module" && !knownIds.has(dep.moduleId)) {
          missing.push({
            module: mod.id,
            references: dep.moduleId,
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("should only require capabilities with compatible providers", () => {
    const missing: Array<{
      module: string;
      capability: string;
      target: string;
    }> = [];

    for (const mod of moduleRegistry) {
      for (const dep of mod.dependencies) {
        if (dep._tag !== "required-capability") continue;

        const providers = moduleRegistry.filter(
          (provider) =>
            provider.provides?.includes(dep.capability) &&
            provider.supportedOn.some((supportedOn) =>
              dep.target.matches(supportedOn),
            ),
        );

        if (providers.length === 0) {
          missing.push({
            module: mod.id,
            capability: dep.capability,
            target: dep.target.toKey(),
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
