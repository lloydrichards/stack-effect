import { Schema } from "effect";
import {
  PackagePublicEntrypoint,
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
  TargetModuleReference,
} from "./Scaffold";

export class InvalidTarget extends Schema.TaggedErrorClass<InvalidTarget>()(
  "InvalidTarget",
  {
    id: Schema.NonEmptyString,
  },
) {}

export class UnknownTargetKind extends Schema.TaggedErrorClass<UnknownTargetKind>()(
  "UnknownTargetKind",
  {
    kind: Schema.NonEmptyString,
  },
) {}

export class UnknownRepoModule extends Schema.TaggedErrorClass<UnknownRepoModule>()(
  "UnknownRepoModule",
  {
    id: RepoModuleId,
  },
) {}

export class UnknownTargetModule extends Schema.TaggedErrorClass<UnknownTargetModule>()(
  "UnknownTargetModule",
  {
    id: TargetModuleId,
  },
) {}

export class InvalidTargetModuleTarget extends Schema.TaggedErrorClass<InvalidTargetModuleTarget>()(
  "InvalidTargetModuleTarget",
  {
    module: TargetModuleReference,
  },
) {}

export class UnsupportedTargetModule extends Schema.TaggedErrorClass<UnsupportedTargetModule>()(
  "UnsupportedTargetModule",
  {
    module: TargetModuleReference,
  },
) {}

export class ConceptualTargetCollision extends Schema.TaggedErrorClass<ConceptualTargetCollision>()(
  "ConceptualTargetCollision",
  {
    path: Schema.NonEmptyString,
    targetIds: Schema.Tuple([Schema.NonEmptyString, Schema.NonEmptyString]),
  },
) {}

export class ContradictoryTargetComposition extends Schema.TaggedErrorClass<ContradictoryTargetComposition>()(
  "ContradictoryTargetComposition",
  {
    id: Schema.NonEmptyString,
    slot: Schema.Literal("package-public-entrypoint"),
  },
) {}

export const BlueprintError = Schema.Union([
  InvalidTarget,
  UnknownTargetKind,
  UnknownRepoModule,
  UnknownTargetModule,
  InvalidTargetModuleTarget,
  UnsupportedTargetModule,
  ConceptualTargetCollision,
  ContradictoryTargetComposition,
]);

export const BlueprintNodeReference = Schema.Union([
  Schema.TaggedStruct("target", {
    id: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("repo-module", {
    id: RepoModuleId,
  }),
  Schema.TaggedStruct("target-module", {
    targetId: Schema.NonEmptyString,
    moduleId: TargetModuleId,
  }),
]);

export const BlueprintCause = Schema.Union([
  Schema.TaggedStruct("selection", {
    source: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("dependency", {
    edgeId: Schema.NonEmptyString,
  }),
]);

export const BlueprintStatus = Schema.Literals(["selected", "implied"]);

export const TargetComposition = Schema.Union([
  Schema.TaggedStruct("package", {
    publicEntrypoint: PackagePublicEntrypoint,
  }),
]);

export const ResolvedTargetModule = Schema.Struct({
  moduleId: TargetModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});

export const ResolvedRepoModule = Schema.Struct({
  moduleId: RepoModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});

export const ResolvedTarget = Schema.Struct({
  id: Schema.NonEmptyString,
  identity: TargetIdentity,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
  targetModules: Schema.Array(ResolvedTargetModule),
  composition: Schema.optional(TargetComposition),
});

export const BlueprintEdgeReason = Schema.Literals([
  "required-owning-target",
  "required-repo-module",
  "required-canonical-target",
  "required-target-module",
]);

export const BlueprintDependencyEdge = Schema.TaggedStruct("depends-on", {
  id: Schema.NonEmptyString,
  from: BlueprintNodeReference,
  to: BlueprintNodeReference,
  reason: BlueprintEdgeReason,
});

export const BlueprintWarning = Schema.Union([
  Schema.TaggedStruct("DuplicateSelectionNormalized", {
    node: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("RedundantSelectionNormalized", {
    node: BlueprintNodeReference,
    edgeIds: Schema.NonEmptyArray(Schema.NonEmptyString),
  }),
]);

export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  nodes: Schema.Array(ResolvedTarget),
  edges: Schema.Array(BlueprintDependencyEdge),
  modules: Schema.Array(ResolvedRepoModule),
  warnings: Schema.Array(BlueprintWarning),
}) {
  prettyPrint(): string {
    const lines: Array<string> = ["Blueprint"];

    if (this.nodes.length > 0) {
      lines.push("", "Targets");

      for (const target of this.nodes) {
        lines.push(
          `- ${target.id} [${target.status}] (${target.identity.kind})`,
        );

        for (const targetModule of target.targetModules) {
          lines.push(
            `  - module:${targetModule.moduleId} [${targetModule.status}]`,
          );
        }

        if (target.composition?._tag === "package") {
          lines.push(
            `  - composition: publicEntrypoint=${target.composition.publicEntrypoint}`,
          );
        }
      }
    }

    if (this.modules.length > 0) {
      lines.push("", "Repo Modules");

      for (const module of this.modules) {
        lines.push(`- ${module.moduleId} [${module.status}]`);
      }
    }

    if (this.edges.length > 0) {
      lines.push("", "Dependencies");

      for (const edge of this.edges) {
        lines.push(
          `- ${formatNodeReference(edge.from)} -> ${formatNodeReference(edge.to)} [${edge.reason}]`,
        );
      }
    }

    if (this.warnings.length > 0) {
      lines.push("", "Warnings");

      for (const warning of this.warnings) {
        lines.push(`- ${warning._tag}: ${formatWarning(warning)}`);
      }
    }

    return lines.join("\n");
  }

  hasTarget(targetId: string): boolean {
    return this.nodes.some((target) => target.id === targetId);
  }

  getTarget(targetId: string): typeof ResolvedTarget.Type | undefined {
    return this.nodes.find((target) => target.id === targetId);
  }

  getSelectedTargets(): Array<typeof ResolvedTarget.Type> {
    return this.nodes.filter((target) => target.status === "selected");
  }

  getImpliedTargets(): Array<typeof ResolvedTarget.Type> {
    return this.nodes.filter((target) => target.status === "implied");
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }
}

const formatWarning = (warning: typeof BlueprintWarning.Type): string => {
  switch (warning._tag) {
    case "DuplicateSelectionNormalized":
      return formatNodeReference(warning.node);
    case "RedundantSelectionNormalized":
      return `${formatNodeReference(warning.node)} <= ${warning.edgeIds.join(
        ", ",
      )}`;
  }
};

const formatNodeReference = (
  reference: typeof BlueprintNodeReference.Type,
): string => {
  switch (reference._tag) {
    case "repo-module":
      return `repo-module:${reference.id}`;
    case "target":
      return `target:${reference.id}`;
    case "target-module":
      return `target-module:${reference.targetId}/${reference.moduleId}`;
  }
};
