import { Schema } from "effect";
import {
  PackagePublicEntrypoint,
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
  TargetModuleReference,
} from "./Scaffold";

export const BlueprintError = Schema.Union([
  Schema.TaggedStruct("InvalidTarget", {
    targetId: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("UnknownTargetKind", {
    targetKind: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("UnknownRepoModule", {
    moduleId: RepoModuleId,
  }),
  Schema.TaggedStruct("UnknownTargetModule", {
    moduleId: TargetModuleId,
  }),
  Schema.TaggedStruct("InvalidTargetModuleTarget", {
    targetModule: TargetModuleReference,
  }),
  Schema.TaggedStruct("UnsupportedTargetModule", {
    targetModule: TargetModuleReference,
  }),
  Schema.TaggedStruct("ConceptualTargetCollision", {
    conceptualPath: Schema.NonEmptyString,
    targetIds: Schema.Tuple([Schema.NonEmptyString, Schema.NonEmptyString]),
  }),
  Schema.TaggedStruct("ContradictoryTargetComposition", {
    targetId: Schema.NonEmptyString,
    slot: Schema.Literal("package-public-entrypoint"),
  }),
]);

export const BlueprintNodeReference = Schema.Union([
  Schema.TaggedStruct("target", {
    targetId: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("repo-module", {
    moduleId: RepoModuleId,
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
    source: BlueprintNodeReference,
  }),
]);

export const BlueprintStatus = Schema.Union([
  Schema.Literal("selected"),
  Schema.Literal("implied"),
]);

export const ResolvedTargetModule = Schema.Struct({
  moduleId: TargetModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});

export const ResolvedTarget = Schema.Struct({
  targetId: Schema.NonEmptyString,
  identity: TargetIdentity,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
  targetModules: Schema.Array(ResolvedTargetModule),
});

export const ResolvedRepoModule = Schema.Struct({
  moduleId: RepoModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});

export const TargetComposition = Schema.Union([
  Schema.TaggedStruct("package", {
    publicEntrypoint: PackagePublicEntrypoint,
  }),
]);

export const BlueprintIntent = Schema.Union([
  Schema.TaggedStruct("PackageEntrypoint", {
    targetId: Schema.NonEmptyString,
    publicEntrypoint: PackagePublicEntrypoint,
  }),
  Schema.TaggedStruct("RepoModule", {
    moduleId: RepoModuleId,
  }),
  Schema.TaggedStruct("Target", {
    targetId: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("TargetModule", {
    targetId: Schema.NonEmptyString,
    moduleId: TargetModuleId,
  }),
]);

export const BlueprintWarning = Schema.Union([
  Schema.TaggedStruct("DuplicateSelectionNormalized", {
    node: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("RedundantSelectionNormalized", {
    node: BlueprintNodeReference,
    causes: Schema.NonEmptyArray(BlueprintNodeReference),
  }),
  Schema.TaggedStruct("ImpliedDependencyAdded", {
    node: BlueprintNodeReference,
    causes: Schema.NonEmptyArray(BlueprintNodeReference),
  }),
]);

export class Blueprint extends Schema.Class<Blueprint>("Blueprint")({
  targets: Schema.Array(ResolvedTarget),
  repoModules: Schema.Array(ResolvedRepoModule),
  targetCompositions: Schema.Record(Schema.NonEmptyString, TargetComposition),
  intents: Schema.Array(BlueprintIntent),
  warnings: Schema.Array(BlueprintWarning),
}) {
  prettyPrint(): string {
    const lines: Array<string> = ["Blueprint"];

    if (this.targets.length > 0) {
      lines.push("", "Targets");

      for (const target of this.targets) {
        lines.push(
          `- ${target.targetId} [${target.status}] (${target.identity.kind})`,
        );

        for (const targetModule of target.targetModules) {
          lines.push(
            `  - module:${targetModule.moduleId} [${targetModule.status}]`,
          );
        }
      }
    }

    if (this.repoModules.length > 0) {
      lines.push("", "Repo Modules");

      for (const repoModule of this.repoModules) {
        lines.push(`- ${repoModule.moduleId} [${repoModule.status}]`);
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
    return this.targets.some((target) => target.targetId === targetId);
  }

  getTarget(targetId: string): typeof ResolvedTarget.Type | undefined {
    return this.targets.find((target) => target.targetId === targetId);
  }

  getSelectedTargets(): Array<typeof ResolvedTarget.Type> {
    return this.targets.filter((target) => target.status === "selected");
  }

  getImpliedTargets(): Array<typeof ResolvedTarget.Type> {
    return this.targets.filter((target) => target.status === "implied");
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }
}

const formatWarning = (warning: typeof BlueprintWarning.Type): string => {
  switch (warning._tag) {
    case "DuplicateSelectionNormalized":
      return formatNodeReference(warning.node);
    case "ImpliedDependencyAdded":
    case "RedundantSelectionNormalized":
      return `${formatNodeReference(warning.node)} <= ${warning.causes
        .map(formatNodeReference)
        .join(", ")}`;
  }
};

const formatNodeReference = (
  reference: typeof BlueprintNodeReference.Type,
): string => {
  switch (reference._tag) {
    case "repo-module":
      return `repo-module:${reference.moduleId}`;
    case "target":
      return `target:${reference.targetId}`;
    case "target-module":
      return `target-module:${reference.targetId}:${reference.moduleId}`;
  }
};
