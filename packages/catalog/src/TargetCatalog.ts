import { CatalogNotFound } from "@repo/domain/Blueprint";
import type { TargetKind } from "@repo/domain/Catalog";
import { Context, Effect, Layer } from "effect";
import { targetRegistry } from "./registry/targetRegistry";

export class TargetCatalog extends Context.Service<TargetCatalog>()(
  "TargetCatalog",
  {
    make: Effect.gen(function* () {
      const index = new Map(targetRegistry.map((m) => [m.kind, m]));

      const get = Effect.fn("TargetCatalog.get")(function* (
        kind: typeof TargetKind.Type,
      ) {
        return yield* Effect.fromNullishOr(index.get(kind)).pipe(
          Effect.mapError(
            () =>
              new CatalogNotFound({
                catalog: "target",
                entity: "target-kind",
                id: kind,
              }),
          ),
        );
      });

      const keys = Array.from(index.keys());

      return { get, keys };
    }),
  },
) {
  static readonly layer = Layer.effect(TargetCatalog)(TargetCatalog.make);
}
