import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import * as Catalog from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import {
  Config,
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
} from "effect";
import { OfficialCatalogLayer } from "../src/service";
import {
  makeDatabaseConfig,
  makeMigrationsDirectoryConfig,
  resolveRuntimeAsset,
} from "../templates/package-db-sqlite/src/RuntimePaths";

const platform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const bypass = Layer.mergeAll(
  NodePath.layer,
  Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({
      exists: () => Effect.die(new Error("Override must not inspect markers")),
      stat: () => Effect.die(new Error("Override must not stat markers")),
    }),
  ),
);
const markerlessUrl = new URL("file:///sqlite-markerless/module.ts");
const sqliteModuleId = Catalog.ModuleId.make("package-db-sqlite");
const parse = <A>(
  config: Config.Config<A>,
  values: Record<string, string> = {},
) => config.parse(ConfigProvider.fromUnknown(values));
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    prefix: "sqlite-runtime-paths-",
  });
  const location = (...parts: ReadonlyArray<string>) =>
    path.join(root, ...parts);
  yield* fs.writeFileString(location("stack.effect.json"), "{}");
  return {
    fs,
    location,
    url: (relative: string) => path.toFileUrl(location(relative)),
  };
});
const includes = (contents: string, expected: ReadonlyArray<string>) =>
  expected.forEach((text) => assert.include(contents, text));
const expectConfigFailure = <A, R>(
  program: Effect.Effect<A, Config.ConfigError, R>,
  cause: readonly [string, string] | undefined,
  ...messages: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(program);
    assert.instanceOf(error, Config.ConfigError);
    assert.instanceOf(error.cause, ConfigProvider.SourceError);
    if (cause)
      assert.nestedPropertyVal(error, `cause.cause.${cause[0]}`, cause[1]);
    includes(error.message, messages);
  });
const owners = [
  ["flat", "packages/db"],
  ["nested", "packages/storage/db"],
] as const;
const runtimes = [
  { _tag: "node", packageManager: "pnpm" },
  { _tag: "bun" },
  { _tag: "deno" },
] as const;

const wiring = (owner: string, runtime: (typeof runtimes)[number]) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const identity = new Catalog.TargetIdentity({
      kind: Catalog.TargetKind.make("package"),
      name: owner.slice("packages/".length),
    });
    const context = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({
        name: Schema.NonEmptyString.make("sqlite-contract"),
        runtime,
      }),
    });
    const module = yield* catalog.getModule(sqliteModuleId);
    const files = module.contributions.filter((item) => item._tag === "file");
    const file = (suffix: string) => {
      const expectedPath = `${owner}/src/${suffix}`;
      const contribution = files.find(
        (item) => context.resolve(item.path) === expectedPath,
      );
      assert.isDefined(contribution);
      return context.resolve(contribution.contents);
    };
    for (const contribution of files) {
      assert.notInclude(context.resolve(contribution.path), "{{");
      assert.notInclude(context.resolve(contribution.contents), "{{");
    }
    const helper = file("RuntimePaths.ts");
    const database = file("Database.ts");
    const migrations = file("Migrations.ts");
    const prefix = { node: "Node", bun: "Bun", deno: "Deno" }[runtime._tag];
    for (const contents of [database, migrations]) {
      includes(contents, [
        'from "./RuntimePaths"',
        "new URL(import.meta.url)",
        `Layer.mergeAll(${prefix}FileSystem.layer, ${prefix}Path.layer)`,
        `@effect/platform-${runtime._tag}`,
        `@effect/sql-sqlite-${runtime._tag === "bun" ? "bun" : "node"}`,
      ]);
    }
    includes(helper, [
      "export const makeDatabaseConfig",
      "export const makeMigrationsDirectoryConfig",
    ]);
    assert.notInclude(helper, "@effect/sql");
    includes(database, [
      "export const DatabaseConfig = makeDatabaseConfig(",
      "const config = yield* DatabaseConfig",
    ]);
    includes(migrations, [
      "makeMigrationsDirectoryConfig(",
      `"${owner}/src/migrations"`,
      "const directory = yield* MigrationsDirectoryConfig",
      "loader: SqliteMigrator.fromFileSystem(directory)",
    ]);
    assert.include(file("migrations/0001_create_db_health.ts"), "db_health");
    if (runtime._tag === "deno")
      assert.include(database, 'import "./DenoSqliteCompat"');
  });

const testServices = Layer.mergeAll(platform, OfficialCatalogLayer);
layer(testServices)("SQLite runtime paths", (it) => {
  // it.effect scopes every program, including each owned filesystem fixture.
  for (const [layout, owner] of owners) {
    it.effect(`${layout} Config and runtime wiring`, () =>
      Effect.gen(function* () {
        const { fs, location, url } = yield* fixture;
        yield* fs.makeDirectory(location(owner, "src"), {
          recursive: true,
        });
        const asset = `${owner}/src/migrations`;
        const databaseUrl = yield* url(`${owner}/src/Database.ts`);
        const migrationUrl = yield* url(`${owner}/src/Migrations.ts`);
        const database = makeDatabaseConfig(databaseUrl, platform);
        const migration = makeMigrationsDirectoryConfig(
          migrationUrl,
          asset,
          platform,
        );
        assert.deepStrictEqual(yield* parse(database), {
          filename: location("data/app.sqlite"),
        });
        assert.strictEqual(yield* parse(migration), location(asset));
        for (const filename of [
          "/external/app.sqlite",
          "./custom/../app.sqlite",
          ":memory:",
        ]) {
          const override = makeDatabaseConfig(markerlessUrl, bypass);
          assert.deepStrictEqual(
            yield* parse(override, { DATABASE_FILE: filename }),
            { filename },
          );
        }
        const migrationOverride = makeMigrationsDirectoryConfig(
          markerlessUrl,
          asset,
          bypass,
        );
        assert.strictEqual(
          yield* parse(migrationOverride, {
            MIGRATIONS_DIRECTORY: "/external/migrations",
          }),
          "/external/migrations",
        );
        yield* expectConfigFailure(
          parse(migrationOverride, {
            MIGRATIONS_DIRECTORY: "relative/migrations",
          }),
          undefined,
          "MIGRATIONS_DIRECTORY must be an absolute path",
        );
        for (const runtime of runtimes) yield* wiring(owner, runtime);
      }),
    );
  }

  it.effect("nearest markers and encoded module URLs", () =>
    Effect.gen(function* () {
      const { fs, location, url } = yield* fixture;
      const markerCases = [
        [
          "inner",
          "data/app.sqlite",
          ["src", "packages/db", "apps/api", "unrelated"],
          [],
        ],
        ["space # percent% ü", "asset", [""], ["%20", "%23", "%25"]],
      ] as const;
      for (const [directory, asset, anchors, encodings] of markerCases) {
        yield* fs.makeDirectory(location(directory));
        yield* fs.writeFileString(
          location(directory, "stack.effect.json"),
          "{}",
        );
        for (const anchor of anchors) {
          yield* fs.makeDirectory(location(directory, anchor), {
            recursive: true,
          });
          const moduleUrl = yield* url(`${directory}/${anchor}/module.ts`);
          includes(moduleUrl.href, encodings);
          assert.strictEqual(
            yield* resolveRuntimeAsset(moduleUrl, asset),
            location(directory, asset),
          );
        }
      }
    }),
  );
  it.effect("typed marker and URL failures", () =>
    Effect.gen(function* () {
      const { fs, location, url } = yield* fixture;
      const marker = location("folder/stack.effect.json");
      yield* fs.makeDirectory(marker, { recursive: true });
      const moduleUrl = yield* url("folder/module.ts");
      yield* expectConfigFailure(
        resolveRuntimeAsset(moduleUrl, "asset"),
        ["message", `Project marker is not a file: ${marker}`],
        "Cannot resolve a default runtime asset",
      );
      const missing = resolveRuntimeAsset(markerlessUrl, "asset").pipe(
        Effect.provideService(
          FileSystem.FileSystem,
          FileSystem.makeNoop({ exists: () => Effect.succeed(false) }),
        ),
      );
      yield* expectConfigFailure(
        missing,
        ["message", "No ancestor stack.effect.json file was found."],
        "DATABASE_FILE / MIGRATIONS_DIRECTORY",
      );
      yield* expectConfigFailure(
        resolveRuntimeAsset(
          new URL("https://invalid.example/module.ts"),
          "asset",
        ),
        ["_tag", "BadArgument"],
      );
    }),
  );
});
