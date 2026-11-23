import { TodoRepository } from "@repo/db/TodoRepository";
import { TodoRpc } from "@repo/domain/TodoRpc";
import { Effect } from "effect";

export const TodoRpcHandlers = TodoRpc.toLayer(
  Effect.gen(function* () {
    const todos = yield* TodoRepository;

    return {
      todo_create: (payload) => todos.create(payload),
      todo_list: () => todos.list,
      todo_get: ({ id }) => todos.get(id),
      todo_update: ({ id, title, completed }) =>
        todos.update(id, { title, completed }),
      todo_delete: ({ id }) => todos.delete(id).pipe(Effect.asVoid),
    };
  }),
);
