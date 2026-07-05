export const dbIndexContents = `export * from "./Database";
export * from "./HealthCheck";
export * from "./Migrations";
`;

export const dbDatabaseContents = `{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { SqliteClient } from "@effect/sql-sqlite-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";{{/if}}
import { Config, Effect, FileSystem, Layer, Path, String } from "effect";

export const DatabaseConfig = Config.all({
  filename: Config.string("DATABASE_FILE").pipe(
    Config.withDefault("../../data/app.sqlite"),
  ),
});

const ensureDatabaseDirectory = (filename: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.dirname(filename);

    if (directory !== "." && directory !== "") {
      yield* fs.makeDirectory(directory, { recursive: true });
    }
  });

export const SqliteLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;
    yield* ensureDatabaseDirectory(config.filename);

    return SqliteClient.layer({
      filename: config.filename,
      transformQueryNames: String.camelToSnake,
      transformResultNames: String.snakeToCamel,
    });
  }),
).pipe(Layer.provide({{#if runtime=bun}}[BunFileSystem.layer, BunPath.layer]{{/if}}{{#if runtime=node}}[NodeFileSystem.layer, NodePath.layer]{{/if}}));
`;

export const dbPostgresDatabaseContents = `import { PgClient } from "@effect/sql-pg";
import { Config, Redacted, String } from "effect";

export const DatabaseConfig = Config.all({
  url: Config.redacted("DATABASE_URL").pipe(
    Config.withDefault(
      Redacted.make(
        "postgres://stack_effect:stack_effect@localhost:5432/stack_effect",
      ),
    ),
  ),
  maxConnections: Config.int("DATABASE_MAX_CONNECTIONS").pipe(
    Config.withDefault(10),
  ),
});

export const PostgresLive = PgClient.layerConfig({
  url: DatabaseConfig.pipe(Config.map((config) => config.url)),
  maxConnections: DatabaseConfig.pipe(
    Config.map((config) => config.maxConnections),
  ),
  transformQueryNames: Config.succeed(String.camelToSnake),
  transformResultNames: Config.succeed(String.snakeToCamel),
});
`;

export const dbMigrationsContents = `{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { SqliteMigrator } from "@effect/sql-sqlite-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteMigrator } from "@effect/sql-sqlite-node";{{/if}}
import { Effect, Layer, Path } from "effect";
import { SqliteLive } from "./Database";

const MigrationsDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "migrations",
  );
});

export const MigrationsLive = Layer.unwrap(
  Effect.map(MigrationsDirectory, (directory) =>
    SqliteMigrator.layer({
      loader: SqliteMigrator.fromFileSystem(directory),
    }),
  ),
).pipe(Layer.provide({{#if runtime=bun}}[BunFileSystem.layer, BunPath.layer]{{/if}}{{#if runtime=node}}[NodeFileSystem.layer, NodePath.layer]{{/if}}));

export const MigratedLive = MigrationsLive.pipe(
  Layer.provide(SqliteLive),
  Layer.orDie,
);

export const DatabaseLive = Layer.mergeAll(SqliteLive, MigratedLive);
`;

export const dbPostgresMigrationsContents = `{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";{{/if}}
import { PgMigrator } from "@effect/sql-pg";
import { Effect, Layer, Path } from "effect";
import { PostgresLive } from "./Database";

const MigrationsDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "migrations",
  );
});

export const MigrationsLive = Layer.unwrap(
  Effect.map(MigrationsDirectory, (directory) =>
    PgMigrator.layer({
      loader: PgMigrator.fromFileSystem(directory),
    }),
  ),
).pipe(Layer.provide({{#if runtime=bun}}[BunFileSystem.layer, BunPath.layer]{{/if}}{{#if runtime=node}}[NodeFileSystem.layer, NodePath.layer]{{/if}}));

export const MigratedLive = MigrationsLive.pipe(
  Layer.provide(PostgresLive),
  Layer.orDie,
);

export const DatabaseLive = Layer.mergeAll(PostgresLive, MigratedLive);
`;

export const dbHealthCheckContents = `import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export const checkDatabaseHealth = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const rows = yield* sql<{ ok: number }>\`SELECT 1 AS ok\`;
  return rows[0]?.ok === 1;
});
`;

export const dbMigration0001CreateDbHealthContents = `import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql\`
    CREATE TABLE IF NOT EXISTS db_health (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      checked_at TEXT NOT NULL DEFAULT current_timestamp
    )
  \`;

  yield* sql\`
    INSERT INTO db_health (id)
    VALUES (1)
    ON CONFLICT(id) DO UPDATE SET checked_at = current_timestamp
  \`;
});
`;

export const dbPostgresMigration0001CreateDbHealthContents = `import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql\`
    CREATE TABLE IF NOT EXISTS db_health (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  \`;

  yield* sql\`
    INSERT INTO db_health (id)
    VALUES (1)
    ON CONFLICT(id) DO UPDATE SET checked_at = now()
  \`;
});
`;

export const dbPostgresEnvExampleContents = `DATABASE_URL=postgres://stack_effect:stack_effect@localhost:5432/stack_effect
DATABASE_MAX_CONNECTIONS=10
`;

export const dbPostgresDockerComposeContents = `services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: stack_effect
      POSTGRES_USER: stack_effect
      POSTGRES_PASSWORD: stack_effect
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stack_effect -d stack_effect"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-data:
`;

export const dbMigrateScriptContents = `{{#if runtime=bun}}import { BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeRuntime } from "@effect/platform-node";{{/if}}
import { Console, Effect } from "effect";
import { MigratedLive } from "../src";

const program = Effect.gen(function* () {
  yield* Console.log("Database migrations completed");
}).pipe(Effect.provide(MigratedLive));

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}.runMain(program);
`;

export const dbHealthScriptContents = `{{#if runtime=bun}}import { BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeRuntime } from "@effect/platform-node";{{/if}}
import { Console, Effect } from "effect";
import { checkDatabaseHealth, DatabaseLive } from "../src";

const program = Effect.gen(function* () {
  const healthy = yield* checkDatabaseHealth;
  yield* Console.log(healthy ? "Database is healthy" : "Database is unhealthy");
}).pipe(Effect.provide(DatabaseLive));

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}.runMain(program);
`;
