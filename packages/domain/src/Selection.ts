import { Schema } from "effect";
import { ModuleId, TargetIdentity } from "./Scaffold";

const HttpApiStyle = Schema.Literals(["rest"]);

const DomainApiSurface = Schema.Literals(["api"]);

export const TargetOptions = Schema.Struct({
  httpApiStyle: Schema.optional(HttpApiStyle),
  domainApiSurface: Schema.optional(DomainApiSurface),
});

export const ModuleSelection = Schema.Struct({
  id: ModuleId,
});

export const TargetSelection = Schema.Struct({
  identity: TargetIdentity,
  modules: Schema.Array(ModuleSelection),
  options: TargetOptions,
});

export const Selection = Schema.Struct({
  targets: Schema.Array(TargetSelection),
});
