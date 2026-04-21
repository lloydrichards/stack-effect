import type { TargetModuleId } from "@repo/domain/Scaffold";
import type { TargetModuleDefinition } from "../catalog/TargetCatalog";

export const targetModuleRegistry = new Map<
  typeof TargetModuleId.Type,
  TargetModuleDefinition
>([
  [
    "domain-api",
    {
      moduleId: "domain-api",
      isSupported: (target) =>
        target.kind === "package" && target.name === "domain",
      dependencies: [],
    },
  ],
  [
    "http-api-server",
    {
      moduleId: "http-api-server",
      isSupported: (target) => target.kind === "server",
      dependencies: [
        {
          requiredCanonicalTarget: {
            kind: "package",
            name: "domain",
          },
          requiredTargetModule: {
            target: {
              kind: "package",
              name: "domain",
            },
            moduleId: "domain-api",
          },
        },
      ],
    },
  ],
]);
