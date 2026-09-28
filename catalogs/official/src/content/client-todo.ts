export const clientTodoAtomContents = `import { TodoApi } from "@repo/domain/TodoApi";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
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
`;

export const clientTodoCardContents = `import { useAtom } from "@effect/atom-react";
import { Option } from "effect";
import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { AsyncResult } from "effect/unstable/reactivity";
import { todoAtom } from "@/lib/atoms/todo-atom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const TodoCard = () => {
  const [result, execute] = useAtom(todoAtom);
  const [title, setTitle] = useState("");
  const value = AsyncResult.value(result);
  const hasLoaded = Option.isSome(value);
  const todos = Option.match(value, {
    onNone: () => [],
    onSome: (response) => response.todos,
  });
  const isWaiting = AsyncResult.isWaiting(result);
  const isFailure = AsyncResult.isFailure(result);

  useEffect(() => {
    execute({ _tag: "list" });
  }, [execute]);

  useEffect(() => {
    if (AsyncResult.isSuccess(result) && result.value.command === "create") {
      setTitle("");
    }
  }, [result]);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (nextTitle.length === 0 || isWaiting) return;
    execute({ _tag: "create", title: nextTitle });
  };

  const retry = () => execute({ _tag: "list" });

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Todos</CardTitle>
            <CardDescription>Persistent tasks from the HTTP API</CardDescription>
          </div>
          <div className="rounded-full border bg-background px-2.5 py-1 font-medium text-muted-foreground text-xs tabular-nums">
            {todos.filter((todo) => !todo.completed).length} open
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
        <form className="flex gap-2" onSubmit={handleCreate}>
          <Input
            aria-label="New todo title"
            disabled={isWaiting}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs doing?"
            value={title}
          />
          <Button
            aria-label="Add todo"
            disabled={title.trim().length === 0 || isWaiting}
            size="icon"
            type="submit"
          >
            <Plus aria-hidden="true" />
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {!hasLoaded && isWaiting ? (
            <div className="flex h-full min-h-32 items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
              <RefreshCw className="size-4 animate-spin" />
              Loading todos…
            </div>
          ) : !hasLoaded && isFailure ? (
            <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 p-6 text-center">
              <div>
                <p className="font-medium text-sm">Could not load todos</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Check that the server is running, then try again.
                </p>
              </div>
              <Button onClick={retry} size="sm" type="button" variant="outline">
                <RefreshCw />
                Try again
              </Button>
            </div>
          ) : todos.length === 0 ? (
            <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="rounded-full border bg-muted p-2">
                <Check className="size-4 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">Nothing on your list</p>
              <p className="max-w-52 text-muted-foreground text-xs">
                Add a task above. It will still be here after the server restarts.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {todos.map((todo) => (
                <li className="group flex items-center gap-3 p-3" key={todo.id}>
                  <button
                    aria-label={
                      todo.completed
                        ? \`Mark \${todo.title} incomplete\`
                        : \`Mark \${todo.title} complete\`
                    }
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors data-[completed=true]:border-primary data-[completed=true]:bg-primary data-[completed=true]:text-primary-foreground"
                    data-completed={todo.completed}
                    disabled={isWaiting}
                    onClick={() =>
                      execute({
                        _tag: "update",
                        id: todo.id,
                        title: todo.title,
                        completed: !todo.completed,
                      })
                    }
                    type="button"
                  >
                    {todo.completed ? <Check className="size-3" /> : null}
                  </button>
                  <span
                    className="min-w-0 flex-1 truncate text-sm data-[completed=true]:text-muted-foreground data-[completed=true]:line-through"
                    data-completed={todo.completed}
                    title={todo.title}
                  >
                    {todo.title}
                  </span>
                  <Button
                    aria-label={\`Delete \${todo.title}\`}
                    className="opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={isWaiting}
                    onClick={() => execute({ _tag: "delete", id: todo.id })}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasLoaded && isFailure ? (
          <div className="flex items-center justify-between gap-3" role="alert">
            <p className="text-destructive text-xs">
              The latest change could not be saved.
            </p>
            <Button onClick={retry} size="sm" type="button" variant="ghost">
              <RefreshCw />
              Refresh
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
`;
