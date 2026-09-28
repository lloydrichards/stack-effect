import { TodoRepository } from "@repo/db";
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
