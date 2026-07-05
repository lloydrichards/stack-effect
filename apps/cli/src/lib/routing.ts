import { CatalogService } from "@repo/catalog";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Effect, Option } from "effect";

type CollectedSelectionTarget = {
  readonly kind: typeof TargetKind.Type;
  readonly name: string;
  readonly modules: ReadonlyArray<typeof ModuleId.Type>;
};

type SeedSelectionTarget = {
  readonly identity: TargetIdentity;
  readonly modules: ReadonlyArray<typeof ModuleId.Type>;
};

export const buildSelectionFrom = Effect.fnUntraced(function* ({
  catalog,
  collected,
  seedTargets = [],
}: {
  catalog: typeof CatalogService.Service;
  collected: ReadonlyArray<CollectedSelectionTarget>;
  seedTargets?: ReadonlyArray<SeedSelectionTarget>;
}) {
  const selectionTargets = new Map<
    string,
    { identity: TargetIdentity; modules: Set<string> }
  >();

  const ensureSelectionTarget = (identity: TargetIdentity) => {
    const key = identity.toKey();
    const existing = selectionTargets.get(key);
    if (existing) return existing;

    const entry = { identity, modules: new Set<string>() };
    selectionTargets.set(key, entry);
    return entry;
  };

  for (const seedTarget of seedTargets) {
    const entry = ensureSelectionTarget(seedTarget.identity);
    for (const moduleId of seedTarget.modules) {
      entry.modules.add(moduleId);
    }
  }

  for (const target of collected) {
    ensureSelectionTarget(
      new TargetIdentity({ kind: target.kind, name: target.name }),
    );
  }

  yield* Effect.forEach(collected, (target) =>
    Effect.gen(function* () {
      const identity = new TargetIdentity({
        kind: target.kind,
        name: target.name,
      });

      yield* Effect.forEach(Arr.dedupe(target.modules), (moduleId) =>
        Effect.gen(function* () {
          const ownSupported = yield* catalog
            .isSupportedOn(moduleId, identity)
            .pipe(Effect.orElseSucceed(() => false));

          if (ownSupported) {
            ensureSelectionTarget(identity).modules.add(moduleId);
            return;
          }

          const mod = yield* catalog
            .getModule(moduleId)
            .pipe(Effect.orElseSucceed(() => null));
          if (!mod) return;

          for (const rule of mod.supportedOn) {
            if (rule._tag === "identity") {
              ensureSelectionTarget(
                new TargetIdentity(rule.identity),
              ).modules.add(moduleId);
              return;
            }

            if (rule._tag === "kind") {
              const existing = Arr.findFirst(
                collected,
                (candidate) => candidate.kind === rule.kind,
              );
              if (Option.isSome(existing)) {
                ensureSelectionTarget(
                  new TargetIdentity({
                    kind: existing.value.kind,
                    name: existing.value.name,
                  }),
                ).modules.add(moduleId);
                return;
              }
            }
          }
        }),
      );
    }),
  );

  return {
    targets: Arr.map(
      Arr.fromIterable(selectionTargets.values()),
      ({ identity, modules }) => ({
        identity,
        modules: Arr.map(Arr.fromIterable(modules), (id) => ({
          id: ModuleId.make(id),
        })),
      }),
    ),
  } satisfies typeof Selection.Type;
});
