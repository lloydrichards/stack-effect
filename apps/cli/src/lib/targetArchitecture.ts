import type { Blueprint } from "@repo/domain/Blueprint";
import {
  type ArchitectureId,
  ClassicArchitecture,
  DddArchitecture,
} from "@repo/domain/Catalog";
import type { RecipeTargetSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import { Array as Arr, Effect, Option } from "effect";

export const SUPPORTED_DDD_COMMAND =
  "stack-effect add --architecture ddd --target server/api:server-http-api-todos";

export const requestedArchitecture = (
  architecture: Option.Option<"classic" | "ddd">,
): typeof ArchitectureId.Type =>
  Option.match(architecture, {
    onNone: () => ClassicArchitecture,
    onSome: (value) =>
      value === "ddd" ? DddArchitecture : ClassicArchitecture,
  });

export const applyArchitecture = (
  targets: ReadonlyArray<RecipeTargetSpec>,
  architecture: typeof ArchitectureId.Type,
): ReadonlyArray<RecipeTargetSpec> =>
  Arr.map(targets, (target) => ({
    ...target,
    ...(architecture === ClassicArchitecture ? {} : { architecture }),
  }));

export const validateArchitectureRequest = Effect.fn(
  "validateArchitectureRequest",
)(function* (
  targets: ReadonlyArray<RecipeTargetSpec>,
  architecture: typeof ArchitectureId.Type,
) {
  if (architecture === ClassicArchitecture) return;
  const allowedModules = new Map([
    [
      "apps/server-api",
      new Set<string>([
        "server-http-api-todos",
        "server-http-api-todos-provider-sqlite",
        "server-http-api-todos-provider-postgres",
      ]),
    ],
    ["apps/client-react-web", new Set<string>(["client-react-http-api-todos"])],
  ]);
  const targetKeys = targets.map(({ target }) => target.toKey());
  const supported =
    targets.length > 0 &&
    targets.length <= allowedModules.size &&
    new Set(targetKeys).size === targetKeys.length &&
    targets.every(({ target, modules }) => {
      const allowed = allowedModules.get(target.toKey());
      return (
        allowed !== undefined &&
        modules.length > 0 &&
        modules.every((module) => allowed.has(module)) &&
        (target.toKey() !== "apps/server-api" ||
          modules.some((module) => module === "server-http-api-todos"))
      );
    });
  if (!supported) {
    return yield* Effect.fail(
      `DDD currently supports exactly logical target server/api with module server-http-api-todos. Use: ${SUPPORTED_DDD_COMMAND}`,
    );
  }
});

export const prospectiveConfig = (
  config: typeof StackConfig.Type,
  blueprint: Blueprint,
): typeof StackConfig.Type => {
  const existing = config.targets ?? [];
  const requested = blueprint.nodes.flatMap((node) =>
    node._tag === "target" && node.architecture !== ClassicArchitecture
      ? [{ identity: node.identity, architecture: node.architecture }]
      : [],
  );
  const resolved = blueprint.nodes.flatMap((node) =>
    node._tag === "target"
      ? [{ identity: node.identity, architecture: node.architecture }]
      : [],
  );
  for (const record of resolved) {
    const durable = existing.find(
      ({ identity }) => identity.toKey() === record.identity.toKey(),
    );
    if (durable !== undefined && durable.architecture !== record.architecture) {
      throw new Error(
        `Target ${record.identity.toKey()} architecture conflict: durable ${durable.architecture}, resolved ${record.architecture}. Target architecture is immutable.`,
      );
    }
  }
  const merged = [...existing];
  for (const record of requested) {
    if (
      !merged.some(
        ({ identity }) => identity.toKey() === record.identity.toKey(),
      )
    )
      merged.push(record);
  }
  merged.sort((left, right) =>
    left.identity.toKey().localeCompare(right.identity.toKey()),
  );
  return new StackConfig({
    ...config,
    ...(merged.length === 0 ? {} : { targets: merged }),
  });
};

export const validateImmutableArchitecture = Effect.fn(
  "validateImmutableArchitecture",
)(function* (
  config: typeof StackConfig.Type,
  targets: ReadonlyArray<RecipeTargetSpec>,
  architecture: typeof ArchitectureId.Type,
  existingTargetKeys: ReadonlySet<string>,
) {
  for (const target of targets) {
    const durable = config.targets?.find(
      ({ identity }) => identity.toKey() === target.target.toKey(),
    );
    const currentArchitecture =
      durable?.architecture ??
      (existingTargetKeys.has(target.target.toKey())
        ? ClassicArchitecture
        : undefined);
    if (
      currentArchitecture !== undefined &&
      currentArchitecture !== architecture
    ) {
      return yield* Effect.fail(
        `Target ${target.target.kind}/${target.target.name} has durable architecture ${currentArchitecture}; requested architecture ${architecture}. Target architecture is immutable.`,
      );
    }
  }
});
