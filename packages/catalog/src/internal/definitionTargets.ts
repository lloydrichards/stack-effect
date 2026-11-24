import type { ModuleDependency, SupportedOn } from "@repo/domain/Catalog";
import { Match } from "effect";

/** @internal */
export const supportedOnTargetKind = Match.type<SupportedOn>().pipe(
  Match.tag("kind", (s) => s.kind),
  Match.tag("identity", (s) => s.identity.kind),
  Match.exhaustive,
);

/** @internal */
export const dependencyTarget = Match.type<ModuleDependency>().pipe(
  Match.tag("required-target", (dependency) => dependency.identity),
  Match.tag(
    "required-module",
    "required-capability",
    (dependency) => dependency.target,
  ),
  Match.exhaustive,
);
