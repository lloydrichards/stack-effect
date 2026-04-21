import { Schema } from "effect";

export const TargetKind = Schema.Union([
  Schema.Literal("client"),
  Schema.Literal("server"),
  Schema.Literal("server-mcp"),
  Schema.Literal("cli"),
  Schema.Literal("package"),
]);

export const RepoModuleId = Schema.Literal("root-bootstrap");

export const TargetModuleId = Schema.Union([
  Schema.Literal("domain-api"),
  Schema.Literal("http-api-server"),
]);

export const TargetIdentity = Schema.Struct({
  kind: TargetKind,
  name: Schema.NonEmptyString,
});

export const TargetReference = Schema.Struct({
  targetId: Schema.NonEmptyString,
});

export const TargetModuleReference = Schema.Struct({
  targetId: Schema.NonEmptyString,
  moduleId: TargetModuleId,
});

export const PackagePublicEntrypoint = Schema.Union([
  Schema.Literal("."),
  Schema.Literal("./Api"),
]);
