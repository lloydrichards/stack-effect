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

export const dddSharedDomainPackageJsonContents = `{
  "name": "@repo/shared-domain",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@effect/tsgo": "^0.22.0",
    "@repo/config-typescript": "workspace:*",
    "vitest": "^4.1.4"
  }
}
`;

export const dddSharedDomainTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "include": ["src", "test"]
}
`;

export const dddSharedDomainIndexContents = `export {};
`;

export const dddTodoDomainPackageJsonContents = `{
  "name": "@repo/todo-domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./api": "./src/api.http.ts",
    "./http": "./src/todo.http.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "effect": "^4.0.0-rc.108"
  },
  "devDependencies": {
    "@repo/config-typescript": "workspace:*",
    "@effect/tsgo": "^0.22.0",
    "vitest": "^4.1.4"
  }
}
`;

export const dddTodoDomainTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": { "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src", "test"]
}
`;

export const dddTodoDomainContents = `import { Schema } from "effect";

export const TodoId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("TodoId"),
);
export type TodoId = typeof TodoId.Type;

export const TodoTitle = Schema.Trim.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(200),
);
export type TodoTitle = typeof TodoTitle.Type;

export const Todo = Schema.Struct({
  id: TodoId,
  title: TodoTitle,
  completed: Schema.Boolean,
});
export type Todo = typeof Todo.Type;

export const CreateTodoInput = Schema.Struct({ title: TodoTitle });
export type CreateTodoInput = typeof CreateTodoInput.Type;

export const UpdateTodoInput = Schema.Struct({
  title: TodoTitle,
  completed: Schema.Boolean,
});
export type UpdateTodoInput = typeof UpdateTodoInput.Type;

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: TodoId },
) {}

export class TodoUnavailable extends Schema.TaggedError<TodoUnavailable>()(
  "TodoUnavailable",
  { message: Schema.String },
) {}
`;

export const dddTodoDomainTestContents = `import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { TodoId, TodoNotFound, TodoTitle } from "../src/todo.ts";

describe("Todo domain", () => {
  it("brands UUID ids and enforces title invariants", () => {
    expect(
      Schema.decodeSync(TodoId)("123e4567-e89b-42d3-a456-426614174000"),
    ).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(Schema.decodeSync(TodoTitle)("  ship it  ")).toBe("ship it");
    expect(() => Schema.decodeSync(TodoId)("not-a-uuid")).toThrow();
    expect(() => Schema.decodeSync(TodoTitle)(" ")).toThrow();
    expect(() => Schema.decodeSync(TodoTitle)("x".repeat(201))).toThrow();
  });
  it("owns the not-found domain failure", () => {
    expect(
      new TodoNotFound({
        id: TodoId.make("123e4567-e89b-42d3-a456-426614174000"),
      })._tag,
    ).toBe("TodoNotFound");
  });
});
`;

export const dddTodoDomainApiContents = `import { HttpApi } from "effect/unstable/httpapi";
import { TodoHttpGroup } from "./todo.http.ts";

export const Api = HttpApi.make("Api").add(TodoHttpGroup);
`;

export const dddTodoDomainHttpContents = `import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoUnavailable,
  UpdateTodoInput,
} from "./todo.ts";
const NotFound = TodoNotFound.pipe(HttpApiSchema.status(404));
const Unavailable = TodoUnavailable.pipe(HttpApiSchema.status(500));
const failures = [NotFound, Unavailable] as const;

export class TodoHttpGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateTodoInput,
      success: Todo.pipe(HttpApiSchema.status(201)),
      error: Unavailable,
    }),
  )
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Todo),
      error: Unavailable,
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: TodoId },
      success: Todo,
      error: failures,
    }),
  )
  .add(
    HttpApiEndpoint.put("update", "/:id", {
      params: { id: TodoId },
      payload: UpdateTodoInput,
      success: Todo,
      error: failures,
    }),
  )
  .add(
    HttpApiEndpoint.delete("delete", "/:id", {
      params: { id: TodoId },
      success: HttpApiSchema.NoContent,
      error: failures,
    }),
  )
  .prefix("/todos") {}
`;

export const dddTodoDomainHttpTestContents = `import { describe, expect, it } from "vitest";
import { TodoUnavailable } from "../src/index.ts";
import { TodoHttpGroup } from "../src/todo.http.ts";

describe("Todo HTTP contract", () => {
  it("exports the group and public unavailable error", () => {
    expect(TodoHttpGroup).toBeDefined();
    expect(new TodoUnavailable({ message: "unavailable" })._tag).toBe(
      "TodoUnavailable",
    );
  });
});
`;

export const dddTodoDomainIndexContents = `export * from "./todo.ts";
`;

export const dddTodoApplicationPackageJsonContents = `{
  "name": "@repo/todo-application",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@repo/todo-domain": "workspace:*",
    "effect": "^4.0.0-rc.108"
  },
  "devDependencies": {
    "@repo/config-typescript": "workspace:*",
    "@effect/tsgo": "^0.22.0",
    "vitest": "^4.1.4"
  }
}
`;

export const dddTodoApplicationTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": { "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src", "test"]
}
`;

export const dddTodoApplicationContents = `import type {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  UpdateTodoInput,
} from "@repo/todo-domain";
import { Context, Effect, Schema } from "effect";

export class TodoRepositoryFailure extends Schema.TaggedError<TodoRepositoryFailure>()(
  "TodoRepositoryFailure",
  { message: Schema.String },
) {}
export interface TodoRepositoryService {
  readonly create: (
    input: CreateTodoInput,
  ) => Effect.Effect<Todo, TodoRepositoryFailure>;
  readonly list: () => Effect.Effect<
    ReadonlyArray<Todo>,
    TodoRepositoryFailure
  >;
  readonly get: (
    id: TodoId,
  ) => Effect.Effect<Todo, TodoNotFound | TodoRepositoryFailure>;
  readonly update: (
    id: TodoId,
    input: UpdateTodoInput,
  ) => Effect.Effect<Todo, TodoNotFound | TodoRepositoryFailure>;
  readonly delete: (
    id: TodoId,
  ) => Effect.Effect<Todo, TodoNotFound | TodoRepositoryFailure>;
}
export class TodoRepository extends Context.Service<
  TodoRepository,
  TodoRepositoryService
>()("TodoRepository") {}
`;

export const dddTodoApplicationTestContents = `import { describe, expect, it, vi } from "vitest";
import { Effect, Layer } from "effect";
import { TodoId, TodoTitle } from "@repo/todo-domain";
import { TodoRepository } from "../src/ports/todo-repository.ts";
import {
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "../src/index.ts";

const id = TodoId.make("123e4567-e89b-42d3-a456-426614174000");
const title = TodoTitle.make("test");
const todo = { id, title, completed: false };

describe("focused Todo use cases", () => {
  it("delegate through the application repository port", async () => {
    const repository = {
      create: vi.fn(() => Effect.succeed(todo)),
      list: vi.fn(() => Effect.succeed([todo])),
      get: vi.fn(() => Effect.succeed(todo)),
      update: vi.fn(() => Effect.succeed({ ...todo, completed: true })),
      delete: vi.fn(() => Effect.succeed(todo)),
    };
    const run = <A, E>(value: Effect.Effect<A, E, TodoRepository>) =>
      Effect.runPromise(
        value.pipe(Effect.provide(Layer.succeed(TodoRepository, repository))),
      );
    await run(createTodo({ title }));
    await run(listTodos());
    await run(getTodo(id));
    await run(updateTodo(id, { title, completed: true }));
    await run(deleteTodo(id));
    expect(Object.values(repository).map((fn) => fn.mock.calls.length)).toEqual(
      [1, 1, 1, 1, 1],
    );
  });
});
`;

export const dddTodoApplicationIndexContents = `export * from "./ports/todo-repository.ts";
export * from "./use-cases/create-todo.ts";
export * from "./use-cases/delete-todo.ts";
export * from "./use-cases/get-todo.ts";
export * from "./use-cases/list-todos.ts";
export * from "./use-cases/update-todo.ts";
`;

export const dddTodoCreateContents = `import type { CreateTodoInput } from "@repo/todo-domain";
import { Effect } from "effect";
import { TodoRepository } from "../ports/todo-repository.ts";
export const createTodo = Effect.fn("createTodo")((input: CreateTodoInput) =>
  TodoRepository.use((repository) => repository.create(input)),
);
`;

export const dddTodoListContents = `import { Effect } from "effect";
import { TodoRepository } from "../ports/todo-repository.ts";
export const listTodos = Effect.fn("listTodos")(() =>
  TodoRepository.use((repository) => repository.list()),
);
`;

export const dddTodoGetContents = `import type { TodoId } from "@repo/todo-domain";
import { Effect } from "effect";
import { TodoRepository } from "../ports/todo-repository.ts";
export const getTodo = Effect.fn("getTodo")((id: TodoId) =>
  TodoRepository.use((repository) => repository.get(id)),
);
`;

export const dddTodoUpdateContents = `import type { TodoId, UpdateTodoInput } from "@repo/todo-domain";
import { Effect } from "effect";
import { TodoRepository } from "../ports/todo-repository.ts";
export const updateTodo = Effect.fn("updateTodo")(
  (id: TodoId, input: UpdateTodoInput) =>
    TodoRepository.use((repository) => repository.update(id, input)),
);
`;

export const dddTodoDeleteContents = `import type { TodoId } from "@repo/todo-domain";
import { Effect } from "effect";
import { TodoRepository } from "../ports/todo-repository.ts";
export const deleteTodo = Effect.fn("deleteTodo")((id: TodoId) =>
  TodoRepository.use((repository) => repository.delete(id)),
);
`;

export const dddTodoInfrastructurePackageJsonContents = `{
  "name": "@repo/todo-infrastructure",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./memory": "./src/memory.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "{{#if runtime=bun}}bunx --bun {{/if}}vitest run"
  },
  "dependencies": {
    "@repo/todo-application": "workspace:*",
    "@repo/todo-domain": "workspace:*",
    "effect": "^4.0.0-rc.108"
  },
  "devDependencies": {
    "@repo/config-typescript": "workspace:*",
    "@effect/tsgo": "^0.22.0",
    "{{#if runtime=bun}}@types/bun{{/if}}{{#if runtime=node}}@types/node{{/if}}": "{{#if runtime=bun}}^1.2.17{{/if}}{{#if runtime=node}}^24.0.0{{/if}}",
    "vitest": "^4.1.4"
  }
}
`;

export const dddTodoInfrastructureTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": { "noEmit": true, "allowImportingTsExtensions": true, "types": ["{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}node{{/if}}"] },
  "include": ["src", "test"]
}
`;

export const dddTodoMemoryContents = `import { TodoRepository } from "@repo/todo-application";
import { type Todo, TodoId, TodoNotFound } from "@repo/todo-domain";
import { Effect, HashMap, Layer, Option, Ref } from "effect";

export const TodoRepositoryMemory = Layer.effect(
  TodoRepository,
  Effect.gen(function* () {
    const todos = yield* Ref.make(HashMap.empty<TodoId, Todo>());
    const find = Effect.fn("TodoRepositoryMemory.find")(function* (id: TodoId) {
      const todo = HashMap.get(yield* Ref.get(todos), id);
      return yield* Option.match(todo, {
        onNone: () => new TodoNotFound({ id }),
        onSome: Effect.succeed,
      });
    });

    return {
      create: Effect.fn("TodoRepositoryMemory.create")(function* (input) {
        const id = TodoId.make(globalThis.crypto.randomUUID());
        const todo = { id, title: input.title, completed: false };
        yield* Ref.update(todos, HashMap.set(id, todo));
        return todo;
      }),
      list: Effect.fn("TodoRepositoryMemory.list")(function* () {
        return Array.from(HashMap.values(yield* Ref.get(todos)));
      }),
      get: find,
      update: Effect.fn("TodoRepositoryMemory.update")(function* (id, input) {
        const current = yield* find(id);
        const todo = { ...current, ...input };
        yield* Ref.update(todos, HashMap.set(id, todo));
        return todo;
      }),
      delete: Effect.fn("TodoRepositoryMemory.delete")(function* (id) {
        const todo = yield* find(id);
        yield* Ref.update(todos, HashMap.remove(id));
        return todo;
      }),
    };
  }),
);
`;

export const dddTodoMemoryTestContents = `import { describe, expect, it } from "vitest";
import { Crypto, Effect, Layer } from "effect";
import {
  TodoRepository,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "@repo/todo-application";
import { TodoId, TodoTitle } from "@repo/todo-domain";
import { TodoRepositoryMemory } from "../src/memory.ts";

const CryptoTest = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: () => new Uint8Array(16),
    digest: (_algorithm, data) => Effect.succeed(data),
  }),
);
const MemoryTest = TodoRepositoryMemory.pipe(Layer.provide(CryptoTest));
const run = <A, E>(effect: Effect.Effect<A, E, TodoRepository>) =>
  Effect.runPromise(effect.pipe(Effect.provide(MemoryTest)));

describe("TodoRepositoryMemory", () => {
  it("supports CRUD and not-found", async () => {
    const result = await run(
      Effect.gen(function* () {
        const created = yield* createTodo({ title: TodoTitle.make("first") });
        const listed = yield* listTodos();
        const updated = yield* updateTodo(created.id, {
          title: TodoTitle.make("changed"),
          completed: true,
        });
        const deleted = yield* deleteTodo(created.id);
        const missing = yield* Effect.flip(getTodo(created.id));
        return { created, listed, updated, deleted, missing };
      }),
    );
    expect(result.listed).toEqual([result.created]);
    expect(result.updated.completed).toBe(true);
    expect(result.deleted.id).toBe(result.created.id);
    expect(result.missing).toMatchObject({ _tag: "TodoNotFound" });
  });

  it("isolates state between layer instances", async () => {
    await run(createTodo({ title: TodoTitle.make("stored") }));
    expect(await run(listTodos())).toEqual([]);
    await expect(
      run(getTodo(TodoId.make("123e4567-e89b-42d3-a456-426614174000"))),
    ).rejects.toMatchObject({ _tag: "TodoNotFound" });
  });
});
`;

export const dddTodoSqliteContents = `{{#if runtime=node}}import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";{{/if}}{{#if runtime=bun}}import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";{{/if}}
import { TodoRepository, TodoRepositoryFailure } from "@repo/todo-application";
import { Todo, TodoId, TodoNotFound } from "@repo/todo-domain";
import { Config, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import migration from "./migrations/sqlite/0001_create_todos.ts";

const TodoRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Union([Schema.Literal(0), Schema.Literal(1)]),
});
export const TodoSqlitePath = Config.string("TODO_SQLITE_PATH").pipe(
  Config.withDefault("../../data/todo.sqlite"),
  Config.map((path) => resolve(path)),
);
const failure = () =>
  new TodoRepositoryFailure({ message: "Todo repository operation failed" });
const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError(failure));
const decode = (value: unknown) =>
  Schema.decodeUnknownEffect(TodoRow)(value).pipe(
    Effect.flatMap((row) =>
      Schema.decodeUnknownEffect(Todo)({
        ...row,
        completed: row.completed === 1,
      }),
    ),
    Effect.mapError(failure),
  );

const RepositoryLive = Layer.effect(
  TodoRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const one = (rows: ReadonlyArray<unknown>, id: TodoId) =>
      rows[0] === undefined
        ? Effect.fail(new TodoNotFound({ id }))
        : decode(rows[0]);
    return {
      create: Effect.fn("TodoRepositorySqlite.create")(function* (input) {
        const id = TodoId.make(globalThis.crypto.randomUUID());
        const rows = yield* run(
          sql\`INSERT INTO todos (id, title, completed) VALUES (\${id}, \${input.title}, 0) RETURNING id, title, completed\`,
        );
        return yield* rows[0] === undefined ? Effect.fail(failure()) : decode(rows[0]);
      }),
      list: Effect.fn("TodoRepositorySqlite.list")(function* () {
        return yield* Effect.forEach(
          yield* run(sql\`SELECT id, title, completed FROM todos ORDER BY id\`),
          decode,
        );
      }),
      get: Effect.fn("TodoRepositorySqlite.get")(function* (id) {
        return yield* one(
          yield* run(sql\`SELECT id, title, completed FROM todos WHERE id = \${id}\`),
          id,
        );
      }),
      update: Effect.fn("TodoRepositorySqlite.update")(function* (id, input) {
        const completed = input.completed ? 1 : 0;
        return yield* one(
          yield* run(sql\`UPDATE todos SET title = \${input.title}, completed = \${completed} WHERE id = \${id} RETURNING id, title, completed\`),
          id,
        );
      }),
      delete: Effect.fn("TodoRepositorySqlite.delete")(function* (id) {
        return yield* one(
          yield* run(sql\`DELETE FROM todos WHERE id = \${id} RETURNING id, title, completed\`),
          id,
        );
      }),
    };
  }),
);

const SqliteLive = Layer.unwrap(
  Effect.gen(function* () {
    const filename = yield* TodoSqlitePath;
    yield* Effect.promise(() => mkdir(dirname(filename), { recursive: true }));
    return SqliteClient.layerConfig({ filename: Config.succeed(filename) });
  }),
);
const MigrationLive = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({ "0001_create_todos": migration }),
}).pipe(Layer.provide(SqliteLive));
export const TodoSqliteLive = RepositoryLive.pipe(
  Layer.provide(Layer.mergeAll(SqliteLive, MigrationLive)),
);
`;

export const dddTodoSqliteTestContents = `import { TodoRepository, createTodo, deleteTodo, getTodo, listTodos, updateTodo } from "@repo/todo-application";
import { TodoTitle } from "@repo/todo-domain";
import { Effect } from "effect";
import { rm } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { TodoSqliteLive } from "../src/sqlite.ts";

const filename = \`/tmp/stack-effect-ddd-todo-\${globalThis.crypto.randomUUID()}.sqlite\`;
process.env["TODO_SQLITE_PATH"] = filename;
const run = <A, E>(effect: Effect.Effect<A, E, TodoRepository>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TodoSqliteLive)));

describe.sequential("TodoSqliteLive", () => {
  afterAll(async () => {
    await Promise.all(
      [filename, \`\${filename}-wal\`, \`\${filename}-shm\`].map((path) =>
        rm(path, { force: true }),
      ),
    );
  });
  it("implements CRUD and SQLite boolean decoding", async () => {
    const created = await run(createTodo({ title: TodoTitle.make("sqlite") }));
    expect(created.completed).toBe(false);
    expect(await run(listTodos())).toEqual([created]);
    const updated = await run(
      updateTodo(created.id, {
        title: TodoTitle.make("durable"),
        completed: true,
      }),
    );
    expect((await run(getTodo(created.id))).completed).toBe(true);
    expect(await run(deleteTodo(created.id))).toEqual(updated);
    await expect(run(getTodo(created.id))).rejects.toMatchObject({
      _tag: "TodoNotFound",
    });
  });
});
`;

export const dddTodoSqliteMigrationContents = `import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql\`CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )\`;
});
`;

export const dddTodoSqliteEnvContents = `TODO_REPOSITORY=sqlite
TODO_SQLITE_PATH=../../data/todo.sqlite
`;

export const dddTodoSqliteIgnoreContents = `*.sqlite
*.sqlite-wal
*.sqlite-shm
`;

export const dddTodoPostgresContents = `import { PgClient } from "@effect/sql-pg";
import { TodoRepository, TodoRepositoryFailure } from "@repo/todo-application";
import { Todo, TodoId, TodoNotFound } from "@repo/todo-domain";
import { Config, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import migration from "./migrations/postgres/0001_create_todos.ts";

export const TodoPostgresConfig = Config.redacted("TODO_DATABASE_URL");
const failure = () =>
  new TodoRepositoryFailure({ message: "Todo repository operation failed" });
const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError(failure));
const decode = (value: unknown) =>
  Schema.decodeUnknownEffect(Todo)(value).pipe(Effect.mapError(failure));

const RepositoryLive = Layer.effect(
  TodoRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const one = (rows: ReadonlyArray<unknown>, id: TodoId) =>
      rows[0] === undefined
        ? Effect.fail(new TodoNotFound({ id }))
        : decode(rows[0]);
    return {
      create: Effect.fn("TodoRepositoryPostgres.create")(function* (input) {
        const id = TodoId.make(globalThis.crypto.randomUUID());
        const rows = yield* run(
          sql\`INSERT INTO todos (id, title, completed) VALUES (\${id}, \${input.title}, FALSE) RETURNING id, title, completed\`,
        );
        return yield* rows[0] === undefined
          ? Effect.fail(failure())
          : decode(rows[0]);
      }),
      list: Effect.fn("TodoRepositoryPostgres.list")(function* () {
        const rows = yield* run(
          sql\`SELECT id, title, completed FROM todos ORDER BY id\`,
        );
        return yield* Effect.forEach(rows, decode);
      }),
      get: Effect.fn("TodoRepositoryPostgres.get")(function* (id) {
        return yield* one(
          yield* run(
            sql\`SELECT id, title, completed FROM todos WHERE id = \${id}\`,
          ),
          id,
        );
      }),
      update: Effect.fn("TodoRepositoryPostgres.update")(function* (id, input) {
        const rows = yield* run(
          sql\`UPDATE todos SET title = \${input.title}, completed = \${input.completed} WHERE id = \${id} RETURNING id, title, completed\`,
        );
        return yield* one(rows, id);
      }),
      delete: Effect.fn("TodoRepositoryPostgres.delete")(function* (id) {
        return yield* one(
          yield* run(
            sql\`DELETE FROM todos WHERE id = \${id} RETURNING id, title, completed\`,
          ),
          id,
        );
      }),
    };
  }),
);

const PgLive = PgClient.layerConfig({ url: TodoPostgresConfig });
const MigrationLive = Layer.effectDiscard(migration).pipe(
  Layer.provide(PgLive),
);
export const TodoPostgresLive = RepositoryLive.pipe(
  Layer.provide(Layer.mergeAll(PgLive, MigrationLive)),
);
`;

export const dddTodoMigrationContents = `import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql\`CREATE TABLE IF NOT EXISTS todos (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE
  )\`;
});
`;

export const dddTodoEnvContents = `TODO_REPOSITORY=postgres
TODO_DATABASE_URL=postgresql://todo:todo@localhost:5432/todo
`;

export const dddTodoComposeContents = `services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: todo
      POSTGRES_PASSWORD: todo
      POSTGRES_DB: todo
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U todo"]
      interval: 2s
      timeout: 2s
      retries: 10
`;

export const dddTodoPresentationPackageJsonContents = `{
  "name": "@repo/todo-presentation",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./http": "./src/http.ts"
  },
  "scripts": {
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/todo-application": "workspace:*",
    "@repo/todo-domain": "workspace:*",
    "effect": "^4.0.0-rc.108"
  },
  "devDependencies": {
    "@repo/config-typescript": "workspace:*",
    "@effect/tsgo": "^0.22.0",
    "vitest": "^4.1.4"
  }
}
`;

export const dddTodoPresentationTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": { "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src", "test"]
}
`;

export const dddTodoHttpContents = `import {
  TodoRepositoryFailure,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "@repo/todo-application";
import { TodoUnavailable } from "@repo/todo-domain";
import { Api } from "@repo/todo-domain/api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

const unavailable = (failure: TodoRepositoryFailure) =>
  Effect.fail(new TodoUnavailable({ message: failure.message }));

export const TodoGroupLayer = HttpApiBuilder.group(
  Api,
  "todos",
  (handlers) =>
    handlers
      .handle("create", ({ payload }) =>
        createTodo(payload).pipe(
          Effect.catchTag("TodoRepositoryFailure", unavailable),
        ),
      )
      .handle("list", () =>
        listTodos().pipe(
          Effect.catchTag("TodoRepositoryFailure", unavailable),
        ),
      )
      .handle("get", ({ params }) =>
        getTodo(params.id).pipe(
          Effect.catchTag("TodoRepositoryFailure", unavailable),
        ),
      )
      .handle("update", ({ params, payload }) =>
        updateTodo(params.id, payload).pipe(
          Effect.catchTag("TodoRepositoryFailure", unavailable),
        ),
      )
      .handle("delete", ({ params }) =>
        deleteTodo(params.id).pipe(
          Effect.catchTag("TodoRepositoryFailure", unavailable),
          Effect.asVoid,
        ),
      ),
);
`;

export const dddTodoPresentationHttpTestContents = `import { TodoRepository } from "@repo/todo-application";
import { TodoId, TodoTitle } from "@repo/todo-domain";
import { TodoHttpGroup } from "@repo/todo-domain/http";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { describe, expect, test } from "vitest";
import { TodoGroupLayer } from "../src/http.ts";

const todo = {
  id: TodoId.make("123e4567-e89b-42d3-a456-426614174000"),
  title: TodoTitle.make("Test todo"),
  completed: false,
};

const RepositoryTest = Layer.succeed(TodoRepository, {
  create: () => Effect.succeed(todo),
  list: () => Effect.succeed([todo]),
  get: () => Effect.succeed(todo),
  update: () => Effect.succeed(todo),
  delete: () => Effect.succeed(todo),
});


describe("Todo presentation HTTP", () => {
  test("constructs the typed Todo group layer", () => {
    const TestLayer = TodoGroupLayer.pipe(
      HttpRouter.provideRequest(RepositoryTest),
    );
    const context = Effect.runSync(Effect.scoped(Layer.build(TestLayer)));

    expect(
      [...context.mapUnsafe.keys()].filter((key) => key === TodoHttpGroup.key),
    ).toEqual([TodoHttpGroup.key]);
  });
});
`;

export const dddTodoHostPackageJsonContents = `{
  "name": "server-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "{{#if runtime=bun}}bun --watch{{/if}}{{#if runtime=node}}node --watch{{/if}} src/index.ts",
    "start": "{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}node{{/if}} src/index.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "{{#if runtime=bun}}@effect/platform-bun{{/if}}{{#if runtime=node}}@effect/platform-node{{/if}}": "^4.0.0-rc.108",
    "@repo/todo-domain": "workspace:*",
    "@repo/todo-infrastructure": "workspace:*",
    "@repo/todo-presentation": "workspace:*",
    "effect": "^4.0.0-rc.108"
  },
  "devDependencies": {
    "@repo/config-typescript": "workspace:*",
    "{{#if runtime=bun}}@types/bun{{/if}}{{#if runtime=node}}@types/node{{/if}}": "{{#if runtime=bun}}^1.2.17{{/if}}{{#if runtime=node}}^24.0.0{{/if}}",
    "@effect/tsgo": "^0.22.0"
  }
}
`;

export const dddTodoHostTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": { "noEmit": true, "allowImportingTsExtensions": true, "types": ["{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}node{{/if}}"] },
  "include": ["src"]
}
`;

export const dddTodoHostContents = `{{#if runtime=bun}}import { BunHttpServer, BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";{{/if}}
import { Api } from "@repo/todo-domain/api";
import { TodoRepositoryMemory } from "@repo/todo-infrastructure/memory";
import { TodoGroupLayer } from "@repo/todo-presentation/http";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";

export const ServerConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(9000)),
  {{#if runtime=bun}}hostname{{/if}}{{#if runtime=node}}host{{/if}}: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  idleTimeout: Config.number("IDLE_TIMEOUT").pipe(Config.withDefault(120)),
  allowedOrigins: Config.string("ALLOWED_ORIGINS").pipe(
    Config.withDefault(
      "http://localhost:3000,http://localhost:5173,http://localhost:4173",
    ),
  ),
});

type RepositoryProviderMap = Record<string, Layer.Layer<any, unknown, never>>;
const defineRepositoryProviders = <const P extends RepositoryProviderMap>(
  providers: P,
) => providers;

const repositoryProviders = defineRepositoryProviders({
  memory: TodoRepositoryMemory,
});
type GeneratedRepositoryProvider = keyof typeof repositoryProviders;
const generatedProviderNames = Object.keys(repositoryProviders) as Array<GeneratedRepositoryProvider>;
const isGeneratedProvider = (value: string): value is GeneratedRepositoryProvider =>
  value in repositoryProviders;

const ApiLayer = HttpApiBuilder.layer(Api);
const ApiLive = ApiLayer.pipe(Layer.provide(TodoGroupLayer));
const AllRouters = Layer.mergeAll(ApiLive, HttpApiScalar.layer(Api));

const HttpLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const provider = yield* Config.string("TODO_REPOSITORY").pipe(
    Config.withDefault("memory"),
  );
  if (!isGeneratedProvider(provider)) {
    return yield* Effect.die(
      \`Unsupported TODO_REPOSITORY "\${provider}". Generated choices: \${generatedProviderNames.join(", ")}.\`,
    );
  }
  const RepositoryLive = repositoryProviders[provider]!;
  const allowedOrigins = config.allowedOrigins.split(",").map((origin) => origin.trim());
  const CorsHttpLive = AllRouters.pipe(
    Layer.provide(
      HttpRouter.cors({
        allowedOrigins,
        allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["content-type", "traceparent", "tracestate", "baggage", "b3", "x-b3-traceid", "x-b3-spanid", "x-b3-parentspanid", "x-b3-sampled", "x-b3-flags"],
        credentials: false,
      }),
    ),
  );
  return HttpRouter.serve(CorsHttpLive).pipe(
    HttpServer.withLogAddress,
    Layer.provide(RepositoryLive),
    Layer.provideMerge({{#if runtime=bun}}BunHttpServer.layerConfig(ServerConfig){{/if}}{{#if runtime=node}}NodeHttpServer.layerConfig(createServer, ServerConfig){{/if}}),
  );
}).pipe(Layer.unwrap, Layer.launch);
{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}.runMain(HttpLive);
`;
