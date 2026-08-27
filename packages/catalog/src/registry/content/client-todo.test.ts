import { describe, expect, it } from "vitest";
import {
  dddClientTodoAtomContents,
  dddClientTodoCardContents,
  dddClientTodoClientContents,
} from "./client-todo";

const contains = (value: string, ...expected: ReadonlyArray<string>) =>
  expected.forEach((entry) => expect(value).toContain(entry));

describe("DDD generated React Todo client", () => {
  it("locally composes the Domain group through Fetch-backed HttpApiClient", () => {
    contains(
      dddClientTodoClientContents,
      'TodoHttpGroup } from "@repo/todo-domain/http"',
      'HttpApi, HttpApiClient } from "effect/unstable/httpapi"',
      'HttpApi.make("TodoHttpApi").add(TodoHttpGroup)',
      "HttpApiClient.make(TodoHttpApi",
      "FetchHttpClient.layer",
      'import.meta.env.VITE_SERVER_URL || "http://localhost:9000"',
    );
    expect(dddClientTodoClientContents).not.toMatch(
      /@repo\/(?:todo-(?:presentation|infrastructure|application|api)|domain\/server)/u,
    );
  });

  it("preserves the Effect Atom CRUD flow through the shared client", () => {
    contains(
      dddClientTodoAtomContents,
      'import type { TodoId } from "@repo/todo-domain"',
      'import { TodoHttpClient } from "../http/todo-client"',
      "runtime.fn",
      "Effect.flatMap",
      "client.todos.list()",
    );
    for (const command of ["list", "get", "create", "update", "delete"])
      expect(dddClientTodoAtomContents).toContain(`_tag: "${command}"`);
  });

  it("keeps accessible states and honest Memory persistence guidance", () => {
    contains(
      dddClientTodoCardContents,
      "useAtom(todoAtom)",
      'role="status"',
      'role="alert"',
      "Memory is process-local and non-persistent",
      "lost when the API restarts",
      "SQLite or PostgreSQL",
      "const [draftTitles, setDraftTitles]",
      "value={draftTitles[todo.id] ?? todo.title}",
    );
    expect(dddClientTodoCardContents).not.toContain(
      "still be here after the server restarts",
    );
  });
});
