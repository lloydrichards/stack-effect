export const domainTodoContents = `import { Schema } from "effect";

export const TodoId = Schema.String.check(Schema.isUUID());
export type TodoId = Schema.Schema.Type<typeof TodoId>;

export const Todo = Schema.Struct({
  id: TodoId,
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
});
export type Todo = Schema.Schema.Type<typeof Todo>;

export const CreateTodoInput = Schema.Struct({
  title: Schema.NonEmptyString,
});
export type CreateTodoInput = Schema.Schema.Type<typeof CreateTodoInput>;

export const UpdateTodoInput = Schema.Struct({
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
});
export type UpdateTodoInput = Schema.Schema.Type<typeof UpdateTodoInput>;

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: TodoId },
) {}

export class TodoPersistenceError extends Schema.TaggedError<TodoPersistenceError>()(
  "TodoPersistenceError",
  { message: Schema.String },
) {}
`;

export const domainTodoApiContents = `import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoPersistenceError,
  UpdateTodoInput,
} from "./Todo";

const NotFound = TodoNotFound.pipe(HttpApiSchema.status(404));
const PersistenceError = TodoPersistenceError.pipe(HttpApiSchema.status(500));
const TodoFailure = [NotFound, PersistenceError] as const;

export class TodoGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateTodoInput,
      success: Todo.pipe(HttpApiSchema.status(201)),
      error: PersistenceError,
    }),
  )
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Todo),
      error: PersistenceError,
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: TodoId },
      success: Todo,
      error: TodoFailure,
    }),
  )
  .add(
    HttpApiEndpoint.put("update", "/:id", {
      params: { id: TodoId },
      payload: UpdateTodoInput,
      success: Todo,
      error: TodoFailure,
    }),
  )
  .add(
    HttpApiEndpoint.delete("delete", "/:id", {
      params: { id: TodoId },
      success: HttpApiSchema.NoContent,
      error: TodoFailure,
    }),
  )
  .prefix("/todos") {}

export const TodoApi = HttpApi.make("TodoApi").add(TodoGroup);
`;

export const domainTodoRpcContents = `import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoPersistenceError,
  UpdateTodoInput,
} from "./Todo";

const TodoFailure = Schema.Union([TodoNotFound, TodoPersistenceError]);

export class TodoRpc extends RpcGroup.make(
  Rpc.make("todo_create", {
    payload: CreateTodoInput,
    success: Todo,
    error: TodoPersistenceError,
  }),
  Rpc.make("todo_list", {
    success: Schema.Array(Todo),
    error: TodoPersistenceError,
  }),
  Rpc.make("todo_get", {
    payload: { id: TodoId },
    success: Todo,
    error: TodoFailure,
  }),
  Rpc.make("todo_update", {
    payload: {
      id: TodoId,
      ...UpdateTodoInput.fields,
    },
    success: Todo,
    error: TodoFailure,
  }),
  Rpc.make("todo_delete", {
    payload: { id: TodoId },
    success: Schema.Void,
    error: TodoFailure,
  }),
) {}
`;

export const todoRepositoryContents = `import {
  type CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoPersistenceError,
  type UpdateTodoInput,
} from "@repo/domain/Todo";
{{#if runtime=bun}}import { layer as PlatformCryptoLayer } from "@effect/platform-bun/BunCrypto";{{/if}}{{#if runtime=node}}import { layer as PlatformCryptoLayer } from "@effect/platform-node/NodeCrypto";{{/if}}
import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

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
      Schema.decodeUnknownEffect(Todo)({
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
        Effect.map(TodoId.make),
        Effect.mapError(persistenceError),
      );

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.tapError(logPersistenceCause),
          Effect.mapError(persistenceError),
        );

      const list = Effect.fn("TodoRepository.list")(function* () {
        const rows = yield* run(
          sql\`SELECT id, title, completed FROM todos ORDER BY id\`,
        );
        return yield* decodeTodos(rows);
      });

      const get = Effect.fn("TodoRepository.get")(function* (id: TodoId) {
        const rows = yield* run(
          sql\`SELECT id, title, completed FROM todos WHERE id = \${id}\`,
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
        const rows = yield* run(sql\`
          INSERT INTO todos (id, title, completed)
          VALUES (\${id}, \${input.title}, 0)
          RETURNING id, title, completed
        \`);
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
        const rows = yield* run(sql\`
          UPDATE todos
          SET title = \${input.title}, completed = \${completed}
          WHERE id = \${id}
          RETURNING id, title, completed
        \`);
        const row = rows[0];
        if (row === undefined) {
          return yield* new TodoNotFound({ id });
        }
        return yield* decodeTodo(row);
      });

      const remove = Effect.fn("TodoRepository.remove")(function* (id: TodoId) {
        const rows = yield* run(sql\`
          DELETE FROM todos
          WHERE id = \${id}
          RETURNING id, title, completed
        \`);
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
`;

export const todoMigrationContents = `import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql\`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    )
  \`;
});
`;

export const serverTodoApiContents = `import { TodoRepository } from "@repo/db";
import { TodoApi } from "@repo/domain/TodoApi";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const TodoGroupLive = HttpApiBuilder.group(
  TodoApi,
  "todos",
  (handlers) =>
    handlers
      .handle("create", ({ payload }) =>
        TodoRepository.use((repository) => repository.create(payload)),
      )
      .handle("list", () =>
        TodoRepository.use((repository) => repository.list()),
      )
      .handle("get", ({ params }) =>
        TodoRepository.use((repository) => repository.get(params.id)),
      )
      .handle("update", ({ params, payload }) =>
        TodoRepository.use((repository) =>
          repository.update(params.id, payload),
        ),
      )
      .handle("delete", ({ params }) =>
        TodoRepository.use((repository) =>
          repository.delete(params.id),
        ).pipe(Effect.asVoid),
      ),
);

export const TodoApiLive = HttpApiBuilder.layer(TodoApi).pipe(
  Layer.provide(TodoGroupLive),
);
`;

export const serverTodoRpcContents = `import { TodoRepository } from "@repo/db";
import { TodoRpc } from "@repo/domain/TodoRpc";
import { Effect } from "effect";

export const TodoRpcHandlers = TodoRpc.toLayer({
  todo_create: (payload) =>
    TodoRepository.use((repository) => repository.create(payload)),
  todo_list: () => TodoRepository.use((repository) => repository.list()),
  todo_get: ({ id }) =>
    TodoRepository.use((repository) => repository.get(id)),
  todo_update: ({ id, title, completed }) =>
    TodoRepository.use((repository) =>
      repository.update(id, { title, completed }),
    ),
  todo_delete: ({ id }) =>
    TodoRepository.use((repository) => repository.delete(id)).pipe(
      Effect.asVoid,
    ),
});
`;

export const todoHttpTransportTestContents = `import { TodoApi } from "@repo/domain/TodoApi";
import { OpenApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

describe("Todo HTTP transport", () => {
  it("publishes the complete CRUD contract", () => {
    const spec = OpenApi.fromApi(TodoApi);

    expect(Object.keys(spec.paths)).toEqual(["/todos", "/todos/{id}"]);
    expect(spec.paths["/todos"]?.post?.responses).toHaveProperty("201");
    expect(spec.paths["/todos"]?.get?.responses).toHaveProperty("200");
    expect(spec.paths["/todos/{id}"]?.get?.responses).toHaveProperty("404");
    expect(spec.paths["/todos/{id}"]?.put?.responses).toHaveProperty("200");
    expect(spec.paths["/todos/{id}"]?.delete?.responses).toHaveProperty("204");
  });
});
`;

export const todoRpcTransportTestContents = `import { RpcApi } from "@repo/domain/Rpc";
import { TodoRpc } from "@repo/domain/TodoRpc";
import { describe, expect, it } from "vitest";

describe("Todo RPC transport", () => {
  it("merges Todo operations into the existing Event RPC group", () => {
    expect(Array.from(TodoRpc.requests.keys())).toEqual([
      "todo_create",
      "todo_list",
      "todo_get",
      "todo_update",
      "todo_delete",
    ]);
    expect(Array.from(RpcApi.requests.keys())).toEqual([
      "tick",
      "todo_create",
      "todo_list",
      "todo_get",
      "todo_update",
      "todo_delete",
    ]);
  });
});
`;

export const todoRepositoryTestContents = `import { SqliteClient } from "@effect/sql-sqlite-node";
import { CreateTodoInput, TodoId, UpdateTodoInput } from "@repo/domain/Todo";
import { Effect, Layer } from "effect";
import { unlink } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { TodoRepository, TodoRepositoryLive } from "./TodoRepository";
import todoMigration from "./migrations/0002_create_todos";

const filename = \`/tmp/stack-effect-todos-\${crypto.randomUUID()}.sqlite\`;
const SqliteLive = SqliteClient.layer({ filename });
const MigratedLive = Layer.effectDiscard(todoMigration).pipe(
  Layer.provide(SqliteLive),
);
const TestDatabaseLive = Layer.mergeAll(SqliteLive, MigratedLive);

const runRepository = <A, E>(
  use: (repository: TodoRepository["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* use(yield* TodoRepository);
    }).pipe(
      Effect.provide(TodoRepositoryLive.pipe(Layer.provide(TestDatabaseLive))),
    ),
  );

describe.sequential("TodoRepository with SQLite", () => {
  afterAll(async () => {
    await unlink(filename);
  });

  it("supports the full CRUD lifecycle with typed missing-item failures", async () => {
    const created = await runRepository((repository) =>
      repository.create(CreateTodoInput.make({ title: "Write tests" })),
    );

    expect(TodoId.make(created.id)).toBe(created.id);
    expect(created).toMatchObject({ title: "Write tests", completed: false });
    expect(await runRepository((repository) => repository.list())).toEqual([
      created,
    ]);
    expect(
      await runRepository((repository) => repository.get(created.id)),
    ).toEqual(created);

    const updated = await runRepository((repository) =>
      repository.update(
        created.id,
        UpdateTodoInput.make({ title: "Tests written", completed: true }),
      ),
    );
    expect(updated).toEqual({
      id: created.id,
      title: "Tests written",
      completed: true,
    });

    expect(
      await runRepository((repository) => repository.delete(created.id)),
    ).toEqual(updated);
    await expect(
      runRepository((repository) => Effect.flip(repository.get(created.id))),
    ).resolves.toMatchObject({ _tag: "TodoNotFound", id: created.id });
    await expect(
      runRepository((repository) =>
        Effect.flip(
          repository.update(
            created.id,
            UpdateTodoInput.make({ title: "Missing", completed: false }),
          ),
        ),
      ),
    ).resolves.toMatchObject({ _tag: "TodoNotFound", id: created.id });
    await expect(
      runRepository((repository) => Effect.flip(repository.delete(created.id))),
    ).resolves.toMatchObject({ _tag: "TodoNotFound", id: created.id });
  });

  it("persists data when database and repository layers are reconstructed", async () => {
    const created = await runRepository((repository) =>
      repository.create(CreateTodoInput.make({ title: "Persistent todo" })),
    );

    expect(
      await runRepository((repository) => repository.get(created.id)),
    ).toEqual(created);
  });
});
`;

export const todoRepositoryPostgresTestContents = `import { PgClient } from "@effect/sql-pg";
import { CreateTodoInput, UpdateTodoInput } from "@repo/domain/Todo";
import { Effect, Layer, Redacted, String } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TodoRepository, TodoRepositoryLive } from "./TodoRepository";
import todoMigration from "./migrations/0002_create_todos";

const databaseUrl =
  Reflect.get(process.env, "TODO_POSTGRES_DATABASE_URL") ?? "";
const PostgresLive = PgClient.layer({
  url: Redacted.make(databaseUrl),
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel,
});
const MigratedLive = Layer.effectDiscard(todoMigration).pipe(
  Layer.provide(PostgresLive),
);
const TestDatabaseLive = Layer.mergeAll(PostgresLive, MigratedLive);

const runRepository = <A, E>(
  use: (repository: TodoRepository["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    TodoRepository.use(use).pipe(
      Effect.provide(TodoRepositoryLive.pipe(Layer.provide(TestDatabaseLive))),
    ),
  );

describe.runIf(databaseUrl.length > 0)("TodoRepository with PostgreSQL", () => {
  beforeAll(() =>
    Effect.runPromise(
      SqlClient.use((sql) => sql\`DROP TABLE IF EXISTS todos\`).pipe(
        Effect.provide(PostgresLive),
      ),
    ),
  );

  afterAll(() =>
    Effect.runPromise(
      SqlClient.use((sql) => sql\`DROP TABLE IF EXISTS todos\`).pipe(
        Effect.provide(PostgresLive),
      ),
    ),
  );

  it("supports the same CRUD and reconstruction behavior", async () => {
    const created = await runRepository((repository) =>
      repository.create(CreateTodoInput.make({ title: "Postgres todo" })),
    );
    expect(created).toMatchObject({ title: "Postgres todo", completed: false });
    expect(await runRepository((repository) => repository.list())).toEqual([
      created,
    ]);

    const updated = await runRepository((repository) =>
      repository.update(
        created.id,
        UpdateTodoInput.make({ title: "Postgres updated", completed: true }),
      ),
    );
    expect(await runRepository((repository) => repository.get(created.id))).toEqual(
      updated,
    );
    expect(await runRepository((repository) => repository.delete(created.id))).toEqual(
      updated,
    );
    await expect(
      runRepository((repository) => Effect.flip(repository.get(created.id))),
    ).resolves.toMatchObject({ _tag: "TodoNotFound", id: created.id });
    await expect(
      runRepository((repository) =>
        Effect.flip(
          repository.update(
            created.id,
            UpdateTodoInput.make({ title: "Missing", completed: false }),
          ),
        ),
      ),
    ).resolves.toMatchObject({ _tag: "TodoNotFound", id: created.id });
    await expect(
      runRepository((repository) => Effect.flip(repository.delete(created.id))),
    ).resolves.toMatchObject({ _tag: "TodoNotFound", id: created.id });
  });
});
`;
