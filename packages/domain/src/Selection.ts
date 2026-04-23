import { Schema } from "effect";
import { ModuleId, TargetIdentity } from "./Scaffold";

const HttpApiStyle = Schema.Literals(["rest"]);

const DomainApiSurface = Schema.Literals(["api"]);

export const TargetOptions = Schema.Struct({
  httpApiStyle: Schema.optional(HttpApiStyle),
  domainApiSurface: Schema.optional(DomainApiSurface),
});
export type TargetOptions = Schema.Schema.Type<typeof TargetOptions>;

export const ModuleSelection = Schema.Struct({
  id: ModuleId,
});
export type ModuleSelection = Schema.Schema.Type<typeof ModuleSelection>;

export const TargetSelection = Schema.Struct({
  identity: TargetIdentity,
  modules: Schema.Array(ModuleSelection),
  options: TargetOptions,
});
export type TargetSelection = Schema.Schema.Type<typeof TargetSelection>;

export const Selection = Schema.Struct({
  targets: Schema.Array(TargetSelection),
});
export type Selection = Schema.Schema.Type<typeof Selection>;
