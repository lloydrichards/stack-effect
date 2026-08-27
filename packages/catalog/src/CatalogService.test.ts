import { assert, layer } from "@effect/vitest";
import {
  ClassicArchitecture,
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CatalogService } from "./CatalogService";

layer(CatalogService.layer)("CatalogService", (it) => {
  it.effect(
    "should expose module incompatibilities when building the public catalog tree",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const workspace = catalog.toCatalogTree.targets.find(
          (target) => target.kind === "workspace",
        );
        const vitePlus = workspace?.modules.find(
          (module) => module.id === "workspace-monorepo-vite-plus",
        );
        const nx = workspace?.modules.find(
          (module) => module.id === "workspace-monorepo-nx",
        );
        assert.deepStrictEqual(vitePlus?.conflictsWith, [
          ModuleId.make("workspace-monorepo-turbo"),
          ModuleId.make("workspace-monorepo-nx"),
        ]);
        assert.deepStrictEqual(nx?.conflictsWith, [
          ModuleId.make("workspace-monorepo-turbo"),
          ModuleId.make("workspace-monorepo-vite-plus"),
        ]);
      }),
  );

  it.effect(
    "projects resolved DDD metadata and keeps unsupported public modules visible-disabled",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const owner = new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        });
        const builder = yield* catalog.toBuilderCatalog({
          owners: [owner],
          architecture: DddArchitecture,
        });
        const server = builder.targets.find(
          (target) => target.kind === "server",
        );
        const modules = builder.targetModules.find(
          (entry) => entry.owner.toKey() === owner.toKey(),
        )?.modules;
        const todo = modules?.find(
          (module) => module.id === "server-http-api-todos",
        );

        assert.deepStrictEqual(server?.supportedArchitectures, [
          ClassicArchitecture,
          DddArchitecture,
        ]);
        assert.deepStrictEqual(todo?.supportedArchitectures, [
          ClassicArchitecture,
          DddArchitecture,
        ]);
        assert.strictEqual(todo?.architecture, DddArchitecture);
        assert.deepStrictEqual(owner.toKey(), "apps/server-api");
        assert.deepStrictEqual(todo?.availability, { enabled: true });
        assert.isTrue((todo?.contributions.length ?? 0) > 0);
        assert.isTrue(
          todo?.contributions.every(
            (contribution) =>
              !("contents" in contribution) &&
              !("content" in contribution) &&
              !("value" in contribution) &&
              !("argument" in contribution),
          ) ?? false,
        );
        assert.isFalse(
          todo?.dependencies.some(
            (dependency) =>
              dependency._tag === "required-capability" &&
              dependency.capability === "db-sql",
          ) ?? true,
        );
        assert.deepStrictEqual(
          modules?.find((module) => module.id === "server-http-rpc")
            ?.availability,
          {
            enabled: false,
            code: "unsupported-architecture",
            reason:
              "Classic only. DDD currently supports the Todo HTTP client and Todo HTTP API.",
            action:
              "Select a supported Todo HTTP module or use Classic architecture.",
          },
        );
        assert.isFalse(
          modules?.some((module) => module.id.startsWith("package-todo-")) ??
            true,
        );
        assert.isFalse(
          builder.targetModules.some(
            (entry) => entry.owner.toKey() === "apps/server-todo-api",
          ),
        );
      }),
  );

  it.effect(
    "applies deterministic disabled-reason precedence before owner attachment",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const owner = new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "not-todo",
        });
        const builder = yield* catalog.toBuilderCatalog({
          owners: [owner],
          architecture: DddArchitecture,
        });
        const modules = builder.targetModules.find(
          (entry) => entry.owner.toKey() === owner.toKey(),
        )?.modules;

        assert.strictEqual(
          modules?.find(({ id }) => id === "server-http-rpc")?.availability
            .code,
          "unsupported-architecture",
        );
      }),
  );

  it.effect(
    "defaults omitted projection architecture to Classic and orders repeated requests deterministically",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const owner = new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "todo",
        });
        const classic = yield* catalog.toBuilderCatalog({ owners: [owner] });
        const first = yield* catalog.toBuilderCatalog({
          owners: [owner],
          architecture: DddArchitecture,
        });
        const second = yield* catalog.toBuilderCatalog({
          owners: [owner],
          architecture: DddArchitecture,
        });

        assert.isTrue(
          classic.targetModules.every((entry) =>
            entry.modules.every(
              (module) => module.architecture === ClassicArchitecture,
            ),
          ),
        );
        assert.deepStrictEqual(first, second);
        assert.deepStrictEqual(
          first.targetModules.map((entry) => entry.owner.toKey()),
          [...first.targetModules]
            .map((entry) => entry.owner.toKey())
            .sort((left, right) => left.localeCompare(right)),
        );
      }),
  );
});
