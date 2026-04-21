import { Schema } from "effect";
import { RepoModuleId, TargetIdentity, TargetModuleId } from "./Scaffold";

const RepoLinter = Schema.Literals(["biome"]);

const TargetRuntime = Schema.Literals(["bun"]);

const RepoOptions = Schema.Struct({
  runtime: Schema.optional(TargetRuntime),
  linter: Schema.optional(RepoLinter),
});

const HttpApiStyle = Schema.Literals(["rest"]);

const DomainApiSurface = Schema.Literals(["api"]);

const TargetOptions = Schema.Struct({
  httpApiStyle: Schema.optional(HttpApiStyle),
  domainApiSurface: Schema.optional(DomainApiSurface),
});

const TargetModuleSelection = Schema.Struct({
  id: TargetModuleId,
});

const TargetSelection = Schema.Struct({
  identity: TargetIdentity,
  modules: Schema.Array(TargetModuleSelection),
  options: TargetOptions,
});

export const Selection = Schema.Struct({
  targets: Schema.Array(TargetSelection),
  modules: Schema.Array(RepoModuleId),
  options: RepoOptions,
});
