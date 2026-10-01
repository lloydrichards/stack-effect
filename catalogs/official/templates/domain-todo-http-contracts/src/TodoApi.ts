import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/http-api";
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
