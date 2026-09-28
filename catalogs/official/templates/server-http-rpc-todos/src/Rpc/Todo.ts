import { TodoRepository } from "@repo/db";
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
