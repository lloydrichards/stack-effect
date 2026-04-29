import { Schema } from "effect";
import {
  DesiredContributions,
  ModuleId,
  TargetKey,
  TargetKind,
  TargetPath,
} from "./Catalog";

export const emptyDesiredContributions =
  (): typeof DesiredContributions.Type => ({
    files: [],
    exports: [],
    dependencies: [],
    scripts: [],
    barrelExports: [],
    tsconfigs: [],
  });

export const TargetContribution = Schema.Struct({
  targetKey: TargetKey,
  contributions: DesiredContributions,
});

export const ModuleContribution = Schema.Struct({
  targetKey: TargetKey,
  moduleId: ModuleId,
  contributions: DesiredContributions,
});

export const ContributionTokenContext = Schema.Struct({
  targetKey: TargetKey,
  targetPath: TargetPath,
  targetKind: TargetKind,
  targetName: Schema.NonEmptyString,
});
