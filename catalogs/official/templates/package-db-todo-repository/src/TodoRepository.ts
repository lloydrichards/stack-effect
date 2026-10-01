import {
  type CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoPersistenceError,
  type UpdateTodoInput,
} from "@repo/domain/Todo";
{{#if runtime=bun}}import { layer as PlatformCryptoLayer } from "@effect/platform-bun/BunCrypto";{{/if}}{{#if runtime=node}}import { layer as PlatformCryptoLayer } from "@effect/platform-node/NodeCrypto";{{/if}}{{#if runtime=deno}}import { layer as PlatformCryptoLayer } from "@effect/platform-deno/DenoCrypto";{{/if}}
import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

const TodoRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Union([Schema.Literal(0), Schema.Literal(1)]),
});

const persistenceError = () =>
  new TodoPersistenceError({ message: "Todo persistence operation failed" });

const logPersistenceCause = (cause: unknown) =>
  Effect.logError("Todo persistence operation failed", cause);

const decodeTodo = (row: unknown) =>
  Schema.decodeUnknownEffect(TodoRow)(row).pipe(
    Effect.flatMap((decoded) =>
      Schema.decodeEffect(Todo)({
        ...decoded,
        completed: decoded.completed === 1,
      }),
    ),
    Effect.tapError(logPersistenceCause),
    Effect.mapError(persistenceError),
  );

const decodeTodos = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, decodeTodo);

export class TodoRepository extends Context.Service<TodoRepository>()(
  "TodoRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;
      const crypto = yield* Crypto.Crypto;

      const generateId = crypto.randomUUIDv4.pipe(
        Effect.map((id) => TodoId.make(id)),
        Effect.mapError(persistenceError),
      );

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.tapError(logPersistenceCause),
          Effect.mapError(persistenceError),
        );

      const list = Effect.fn("TodoRepository.list")(function* () {
        const rows = yield* run(
          sql`SELECT id, title, completed FROM todos ORDER BY id`,
        );
        return yield* decodeTodos(rows);
      });

      const get = Effect.fn("TodoRepository.get")(function* (id: TodoId) {
        const rows = yield* run(
          sql`SELECT id, title, completed FROM todos WHERE id = ${id}`,
        );
        const row = rows[0];
        if (row === undefined) {
          return yield* new TodoNotFound({ id });
        }
        return yield* decodeTodo(row);
      });

      const create = Effect.fn("TodoRepository.create")(function* (
        input: CreateTodoInput,
      ) {
        const id = yield* generateId;
        const rows = yield* run(sql`
          INSERT INTO todos (id, title, completed)
          VALUES (${id}, ${input.title}, 0)
          RETURNING id, title, completed
        `);
        const row = rows[0];
        if (row === undefined) {
          return yield* new TodoPersistenceError({
            message: "Creating a todo did not return the created row",
          });
        }
        return yield* decodeTodo(row);
      });

      const update = Effect.fn("TodoRepository.update")(function* (
        id: TodoId,
        input: UpdateTodoInput,
      ) {
        const completed = input.completed ? 1 : 0;
        const rows = yield* run(sql`
          UPDATE todos
          SET title = ${input.title}, completed = ${completed}
          WHERE id = ${id}
          RETURNING id, title, completed
        `);
        const row = rows[0];
        if (row === undefined) {
          return yield* new TodoNotFound({ id });
        }
        return yield* decodeTodo(row);
      });

      const remove = Effect.fn("TodoRepository.remove")(function* (id: TodoId) {
        const rows = yield* run(sql`
          DELETE FROM todos
          WHERE id = ${id}
          RETURNING id, title, completed
        `);
        const row = rows[0];
        if (row === undefined) {
          return yield* new TodoNotFound({ id });
        }
        return yield* decodeTodo(row);
      });

      return { create, list, get, update, delete: remove } as const;
    }),
  },
) {}

export const TodoRepositoryLive = Layer.effect(TodoRepository)(
  TodoRepository.make,
).pipe(
  Layer.provide(PlatformCryptoLayer),
  Layer.satisfiesServicesType<SqlClient>(),
);
