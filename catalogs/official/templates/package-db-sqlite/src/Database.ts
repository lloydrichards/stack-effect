{{#if runtime=deno}}import "./DenoSqliteCompat";{{/if}}{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { SqliteClient } from "@effect/sql-sqlite-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";{{/if}}{{#if runtime=deno}}import { DenoFileSystem, DenoPath } from "@effect/platform-deno";
import { SqliteClient } from "@effect/sql-sqlite-node";{{/if}}
import { Config, Effect, FileSystem, Layer, Path, String } from "effect";

export const DatabaseConfig = Config.all({
  filename: Config.String("DATABASE_FILE").pipe(
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
).pipe(Layer.provide({{#if runtime=bun}}[BunFileSystem.layer, BunPath.layer]{{/if}}{{#if runtime=node}}[NodeFileSystem.layer, NodePath.layer]{{/if}}{{#if runtime=deno}}[DenoFileSystem.layer, DenoPath.layer]{{/if}}));
