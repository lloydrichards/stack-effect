import { TodoRepository } from "@repo/db";
import { TodoApi } from "@repo/domain/TodoApi";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";

const TodoHandlers = HttpApiBuilder.group(TodoApi, "todos", (handlers) =>
  Effect.gen(function* () {
    const todos = yield* TodoRepository;

    return handlers
      .handle("create", ({ payload }) => todos.create(payload))
      .handle("list", () => todos.list)
      .handle("get", ({ params }) => todos.get(params.id))
      .handle("update", ({ params, payload }) =>
        todos.update(params.id, payload),
      )
      .handle("delete", ({ params }) =>
        todos.delete(params.id).pipe(Effect.asVoid),
      );
  }),
);

export const TodoRoutes = HttpApiBuilder.layer(TodoApi).pipe(
  Layer.provide(TodoHandlers),
);
