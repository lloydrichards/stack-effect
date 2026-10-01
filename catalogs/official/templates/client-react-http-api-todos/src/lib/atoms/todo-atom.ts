import { TodoApi } from "@repo/domain/TodoApi";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { runtime } from "../atom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

export type TodoCommand =
  | { readonly _tag: "list" }
  | { readonly _tag: "create"; readonly title: string }
  | {
      readonly _tag: "update";
      readonly id: string;
      readonly title: string;
      readonly completed: boolean;
    }
  | { readonly _tag: "delete"; readonly id: string };

export const todoAtom = runtime.fn((command: TodoCommand) =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(TodoApi, {
      baseUrl: SERVER_URL,
    });

    switch (command._tag) {
      case "list":
        break;
      case "create":
        yield* client.todos.create({ payload: { title: command.title } });
        break;
      case "update":
        yield* client.todos.update({
          params: { id: command.id },
          payload: {
            title: command.title,
            completed: command.completed,
          },
        });
        break;
      case "delete":
        yield* client.todos.delete({ params: { id: command.id } });
        break;
    }

    return {
      command: command._tag,
      todos: yield* client.todos.list(),
    } as const;
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);
