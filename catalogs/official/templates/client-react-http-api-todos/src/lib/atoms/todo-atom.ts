import type { TodoId } from "@repo/domain/Todo";
import { TodoApi } from "@repo/domain/TodoApi";
import { Effect, Match } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { runtime } from "../atom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

export type TodoCommand =
  | { readonly _tag: "list" }
  | { readonly _tag: "create"; readonly title: string }
  | {
      readonly _tag: "update";
      readonly id: TodoId;
      readonly title: string;
      readonly completed: boolean;
    }
  | { readonly _tag: "delete"; readonly id: TodoId };

export const todoAtom = runtime.fn((command: TodoCommand) =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(TodoApi, {
      baseUrl: SERVER_URL,
    });

    yield* Match.value(command).pipe(
      Match.tagsExhaustive({
        list: () => Effect.void,
        create: ({ title }) =>
          Effect.asVoid(client.todos.create({ payload: { title } })),
        update: ({ id, title, completed }) =>
          Effect.asVoid(
            client.todos.update({
              params: { id },
              payload: { title, completed },
            }),
          ),
        delete: ({ id }) =>
          Effect.asVoid(client.todos.delete({ params: { id } })),
      }),
    );

    return {
      command: command._tag,
      todos: yield* client.todos.list(),
    } as const;
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);
