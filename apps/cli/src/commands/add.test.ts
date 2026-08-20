import { describe, expect, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { ModuleId, TargetKind } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { type CollectedTarget, resolveCapabilities } from "./add";

describe("add capability resolution", () => {
  it.effect("offers providers required by a transitive module dependency", () =>
    Effect.gen(function* () {
      const targets: Array<CollectedTarget> = [
        {
          kind: TargetKind.make("server"),
          name: "api",
          modules: [ModuleId.make("server-http-api-todos")],
          confirmed: true,
        },
      ];
      const offeredProviders: Array<string> = [];

      const changed = yield* resolveCapabilities(
        targets,
        false,
        ({ definition, providers }) =>
          Effect.sync(() => {
            offeredProviders.push(
              `${definition.id}:${providers.map((provider) => provider.id).join(",")}`,
            );
            return providers[0];
          }).pipe(
            Effect.flatMap((provider) =>
              provider === undefined
                ? Effect.die("Expected at least one database provider")
                : Effect.succeed(provider),
            ),
          ),
      );

      expect(changed).toBe(true);
      expect(offeredProviders).toEqual([
        "package-db-todo-repository:package-db-sqlite,package-db-postgres",
      ]);
      expect(targets).toContainEqual({
        kind: "package",
        name: "db",
        modules: ["package-db-sqlite"],
        confirmed: false,
      });
    }).pipe(Effect.provide(CatalogService.layer)),
  );
});
