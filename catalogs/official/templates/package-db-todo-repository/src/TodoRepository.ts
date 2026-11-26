import * as SecureRandom from "effect/crypto/SecureRandom";
import {
  type CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoPersistenceError,
  type UpdateTodoInput,
} from "@repo/domain/Todo";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

const TodoRow = Todo.mapFields((fields) => ({
  ...fields,
  completed: Schema.BooleanFromBit,
}));

const PersistenceError = new TodoPersistenceError({
  message: "Todo persistence operation failed",
});

const logPersistenceCause = (cause: unknown) =>
  Effect.logError("Todo persistence operation failed", cause);

const decodeTodo = (row: unknown) =>
  Schema.decodeUnknownEffect(TodoRow)(row).pipe(
    Effect.tapError(logPersistenceCause),
    Effect.mapError(() => PersistenceError),
  );

const decodeTodos = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, decodeTodo);

export class TodoRepository extends Context.Service<
  TodoRepository,
  {
    readonly create: (
      input: CreateTodoInput,
    ) => Effect.Effect<Todo, TodoPersistenceError>;
    readonly list: Effect.Effect<ReadonlyArray<Todo>, TodoPersistenceError>;
    readonly get: (
      id: TodoId,
    ) => Effect.Effect<Todo, TodoNotFound | TodoPersistenceError>;
    readonly update: (
      id: TodoId,
      input: UpdateTodoInput,
    ) => Effect.Effect<Todo, TodoNotFound | TodoPersistenceError>;
    readonly delete: (
      id: TodoId,
    ) => Effect.Effect<Todo, TodoNotFound | TodoPersistenceError>;
  }
>()("TodoRepository") {
  static readonly layer = Layer.effect(
    TodoRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      const crypto = yield* SecureRandom.SecureRandom;

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.tapError(logPersistenceCause),
          Effect.mapError(() => PersistenceError),
        );

      const generateId = run(crypto.uuidV4()).pipe(
        Effect.map((id) => TodoId.make(id)),
      );

      const list = Effect.gen(function* () {
        const rows = yield* run(
          sql`SELECT id, title, completed FROM todos ORDER BY id`,
        );
        return yield* decodeTodos(rows);
      }).pipe(Effect.withSpan("TodoRepository.list"));

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

      return TodoRepository.of({ create, list, get, update, delete: remove });
    }),
  );
}
