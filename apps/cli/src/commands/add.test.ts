import { assert, describe, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  CatalogNotFound,
  ModuleCapability,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Array as Arr, Effect, Layer } from "effect";
import { type CollectedTarget, resolveCapabilitiesNonInteractive } from "./add";

const packageDb = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "db",
});

const serverApi = new TargetIdentity({
  kind: TargetKind.make("server"),
  name: "api",
});

const dbSql = ModuleCapability.make("db-sql");

const makeModule = (
  id: string,
  options: Partial<typeof ModuleDefinition.Type> = {},
): typeof ModuleDefinition.Type => ({
  id: ModuleId.make(id),
  title: id,
  description: id,
  supportedOn: [{ _tag: "identity", identity: serverApi }],
  dependencies: [],
  contributions: [],
  ...options,
});

const makeCatalogLayer = (
  modules: ReadonlyArray<typeof ModuleDefinition.Type>,
) =>
  Layer.succeed(CatalogService, {
    getModule: Effect.fn("MockCatalog.getModule")(function* (
      moduleId: typeof ModuleId.Type,
    ) {
      const module = Arr.findFirst(modules, (mod) => mod.id === moduleId);
      if (module._tag === "Some") return module.value;
      return yield* new CatalogNotFound({
        catalog: "module",
        entity: "module",
        id: moduleId,
      });
    }),
    getCapabilityProviders: (options: {
      capability: typeof ModuleCapability.Type;
      target: TargetIdentity;
      visibility?: "public" | "internal";
    }) =>
      Arr.filter(
        modules,
        (mod) =>
          Arr.contains(mod.provides ?? [], options.capability) &&
          Arr.some(mod.supportedOn, (supportedOn) =>
            options.target.matches(supportedOn),
          ) &&
          (options.visibility === undefined ||
            (mod.visibility ?? "public") === options.visibility),
      ),
    getModules: () => modules,
    getImplications: Effect.fn("MockCatalog.getImplications")(function* () {
      return new Set<string>();
    }),
    getSupportedModules: Effect.fn("MockCatalog.getSupportedModules")(
      function* () {
        return [...modules];
      },
    ),
    getTargetKinds: () => [],
    getTarget: Effect.fn("MockCatalog.getTarget")(function* (kind) {
      return {
        kind,
        title: kind,
        description: kind,
        contributions: [],
        scripts: [],
        nextSteps: [],
        requiredModules: [],
      };
    }),
    isSupportedOn: Effect.fn("MockCatalog.isSupportedOn")(function* () {
      return true;
    }),
    isImpliedByAny: Effect.fn("MockCatalog.isImpliedByAny")(function* () {
      return false;
    }),
    toCatalogTree: { targets: [] },
    toGraph: undefined as never,
  });

describe("resolveCapabilitiesNonInteractive", () => {
  it.effect(
    "should add the provider module when a required capability has one matching provider then report the target set changed",
    () => {
      const requiringModule = makeModule("needs-db", {
        dependencies: [
          {
            _tag: "required-capability",
            target: packageDb,
            capability: dbSql,
          },
        ],
      });
      const providerModule = makeModule("package-db-sqlite", {
        provides: [dbSql],
        supportedOn: [{ _tag: "identity", identity: packageDb }],
      });

      return Effect.gen(function* () {
        const targets: Array<CollectedTarget> = [
          {
            kind: TargetKind.make("server"),
            name: "api",
            modules: [requiringModule.id],
            confirmed: true,
          },
        ];

        const changed = yield* resolveCapabilitiesNonInteractive(targets);

        assert.isTrue(changed);
        assert.deepStrictEqual(targets, [
          {
            kind: TargetKind.make("server"),
            name: "api",
            modules: [requiringModule.id],
            confirmed: true,
          },
          {
            kind: TargetKind.make("package"),
            name: "db",
            modules: [providerModule.id],
            confirmed: true,
          },
        ]);
      }).pipe(
        Effect.provide(makeCatalogLayer([requiringModule, providerModule])),
      );
    },
  );

  it.effect(
    "should fail when a required capability has multiple matching providers then explain that interactive selection is required",
    () => {
      const requiringModule = makeModule("needs-db", {
        dependencies: [
          {
            _tag: "required-capability",
            target: packageDb,
            capability: dbSql,
          },
        ],
      });
      const providerModules = [
        makeModule("package-db-sqlite", {
          provides: [dbSql],
          supportedOn: [{ _tag: "identity", identity: packageDb }],
        }),
        makeModule("package-db-postgres", {
          provides: [dbSql],
          supportedOn: [{ _tag: "identity", identity: packageDb }],
        }),
      ];

      return Effect.gen(function* () {
        const targets: Array<CollectedTarget> = [
          {
            kind: TargetKind.make("server"),
            name: "api",
            modules: [requiringModule.id],
            confirmed: true,
          },
        ];

        const error = yield* Effect.flip(
          resolveCapabilitiesNonInteractive(targets),
        );

        assert.include(error, "multiple providers are available");
      }).pipe(
        Effect.provide(makeCatalogLayer([requiringModule, ...providerModules])),
      );
    },
  );
});
