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

export const dddClientTodoClientContents =
  'import { TodoHttpGroup } from "@repo/todo-domain/http";\nimport { Effect } from "effect";\nimport { FetchHttpClient } from "effect/unstable/http";\nimport { HttpApi, HttpApiClient } from "effect/unstable/httpapi";\n\nconst TodoHttpApi = HttpApi.make("TodoHttpApi").add(TodoHttpGroup);\n\nconst SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";\n\nexport const TodoHttpClient = Effect.gen(function* () {\n  return yield* HttpApiClient.make(TodoHttpApi, { baseUrl: SERVER_URL });\n}).pipe(Effect.provide(FetchHttpClient.layer));\n';

export const dddClientTodoAtomContents =
  'import type { TodoId } from "@repo/todo-domain";\nimport { Effect } from "effect";\nimport { TodoHttpClient } from "../http/todo-client";\nimport { runtime } from "../atom";\n\nexport type TodoCommand =\n  | { readonly _tag: "list" }\n  | { readonly _tag: "get"; readonly id: TodoId }\n  | { readonly _tag: "create"; readonly title: string }\n  | { readonly _tag: "update"; readonly id: TodoId; readonly title: string; readonly completed: boolean }\n  | { readonly _tag: "delete"; readonly id: TodoId };\n\nexport const todoAtom = runtime.fn((command: TodoCommand) =>\n  TodoHttpClient.pipe(\n    (effect) =>\n      effect.pipe(\n        // Keep every interaction on the shared generated client.\n        // The list refresh makes mutation results immediately visible.\n        Effect.flatMap((client) =>\n          Effect.gen(function* () {\n            const selected =\n              command._tag === "get"\n                ? yield* client.todos.get({ params: { id: command.id } })\n                : undefined;\n            if (command._tag === "create")\n              yield* client.todos.create({ payload: { title: command.title } });\n            if (command._tag === "update")\n              yield* client.todos.update({ params: { id: command.id }, payload: command });\n            if (command._tag === "delete")\n              yield* client.todos.delete({ params: { id: command.id } });\n            return { command: command._tag, selected, todos: yield* client.todos.list() } as const;\n          }),\n        ),\n      ),\n  ),\n);\n';

export const dddClientTodoCardContents =
  'import { useAtom } from "@effect/atom-react";\nimport { Option } from "effect";\nimport { AsyncResult } from "effect/unstable/reactivity";\nimport { type FormEvent, useEffect, useRef, useState } from "react";\nimport { todoAtom } from "@/lib/atoms/todo-atom";\nimport { Button } from "@/components/ui/button";\nimport { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";\nimport { Input } from "@/components/ui/input";\n\nexport const TodoCard = () => {\n  const [result, execute] = useAtom(todoAtom);\n  const [title, setTitle] = useState("");\n  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});\n  const hasRequestedInitialList = useRef(false);\n  const value = AsyncResult.value(result);\n  const hasLoaded = Option.isSome(value);\n  const response = Option.getOrUndefined(value);\n  const todos = response?.todos ?? [];\n  const waiting = AsyncResult.isWaiting(result);\n  const failed = AsyncResult.isFailure(result);\n\n  useEffect(() => {\n    if (hasRequestedInitialList.current) return;\n    hasRequestedInitialList.current = true;\n    execute({ _tag: "list" });\n  }, [execute]);\n  useEffect(() => {\n    setDraftTitles(\n      Object.fromEntries(\n        (response?.todos ?? []).map((todo) => [todo.id, todo.title]),\n      ),\n    );\n  }, [response?.todos]);\n  useEffect(() => {\n    if (AsyncResult.isSuccess(result) && result.value.command === "create") setTitle("");\n  }, [result]);\n\n  const create = (event: FormEvent) => {\n    event.preventDefault();\n    if (title.trim() && !waiting) execute({ _tag: "create", title: title.trim() });\n  };\n\n  return (\n    <Card className="flex h-full flex-col overflow-hidden">\n      <CardHeader>\n        <CardTitle>Todos</CardTitle>\n        <CardDescription>\n          Memory is process-local and non-persistent; data is lost when the API restarts. Durable storage requires generating a SQLite or PostgreSQL adapter.\n        </CardDescription>\n      </CardHeader>\n      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">\n        <form className="flex gap-2" onSubmit={create}>\n          <Input aria-label="New todo title" disabled={waiting} onChange={(event) => setTitle(event.target.value)} value={title} />\n          <Button disabled={!title.trim() || waiting} type="submit">Create</Button>\n        </form>\n        {!hasLoaded && waiting ? <p aria-live="polite" role="status">Loading todos\u2026</p> : null}\n        {!hasLoaded && failed ? <div role="alert">Could not load todos. <Button onClick={() => execute({ _tag: "list" })}>Try again</Button></div> : null}\n        {hasLoaded && todos.length === 0 ? <p role="status">Nothing on your list.</p> : null}\n        <ul className="space-y-2 overflow-y-auto">\n          {todos.map((todo) => (\n            <li className="flex items-center gap-2" key={todo.id}>\n              <input\n                aria-label={`Mark ${todo.title} ${todo.completed ? "incomplete" : "complete"}`}\n                checked={todo.completed}\n                disabled={waiting}\n                onChange={() => execute({ _tag: "update", id: todo.id, title: todo.title, completed: !todo.completed })}\n                type="checkbox"\n              />\n              <Input\n                aria-label={`Title for ${todo.title}`}\n                disabled={waiting}\n                onBlur={(event) => {\n                  const next = event.target.value.trim();\n                  if (next && next !== todo.title) execute({ _tag: "update", id: todo.id, title: next, completed: todo.completed });\n                }}\n                onChange={(event) =>\n                  setDraftTitles((titles) => ({ ...titles, [todo.id]: event.target.value }))\n                }\n                value={draftTitles[todo.id] ?? todo.title}\n              />\n              <Button onClick={() => execute({ _tag: "get", id: todo.id })} type="button" variant="outline">Get</Button>\n              <Button aria-label={`Delete ${todo.title}`} onClick={() => execute({ _tag: "delete", id: todo.id })} type="button" variant="destructive">Delete</Button>\n            </li>\n          ))}\n        </ul>\n        {response?.selected ? <p aria-live="polite" role="status">Loaded: {response.selected.title}</p> : null}\n        {hasLoaded && failed ? <p role="alert">The latest change could not be saved.</p> : null}\n      </CardContent>\n    </Card>\n  );\n};\n';
