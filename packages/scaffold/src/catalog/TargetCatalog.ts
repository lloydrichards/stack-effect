import type {
  RepoModuleId,
  TargetIdentity,
  TargetKind,
  TargetModuleId,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";

export type TargetModuleDefinition = {
  readonly moduleId: typeof TargetModuleId.Type;
  readonly isSupported: (target: typeof TargetIdentity.Type) => boolean;
  readonly dependencies: ReadonlyArray<TargetModuleDependency>;
};
export type TargetDefinition = {
  readonly kind: typeof TargetKind.Type;
  readonly requiredRepoModules: ReadonlyArray<typeof RepoModuleId.Type>;
};
export type TargetModuleDependency = {
  readonly requiredCanonicalTarget?: typeof TargetIdentity.Type;
  readonly requiredTargetModule?: {
    readonly target: typeof TargetIdentity.Type;
    readonly moduleId: typeof TargetModuleId.Type;
  };
};

const targetDefinitions = new Map<typeof TargetKind.Type, TargetDefinition>([
  [
    "client",
    {
      kind: "client",
      requiredRepoModules: ["root-bootstrap"],
    },
  ],
  [
    "server",
    {
      kind: "server",
      requiredRepoModules: ["root-bootstrap"],
    },
  ],
  [
    "cli",
    {
      kind: "cli",
      requiredRepoModules: ["root-bootstrap"],
    },
  ],
  [
    "package",
    {
      kind: "package",
      requiredRepoModules: ["root-bootstrap"],
    },
  ],
]);

export class TargetCatalog extends Context.Service<TargetCatalog>()(
  "TargetCatalog",
  {
    make: Effect.succeed({
      getTargetDefinition: (kind: typeof TargetKind.Type) =>
        targetDefinitions.get(kind),
    }),
  },
) {
  static readonly layer = Layer.effect(TargetCatalog)(TargetCatalog.make);
}
