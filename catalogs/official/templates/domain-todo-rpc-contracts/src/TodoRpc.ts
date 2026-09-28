import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  TodoPersistenceError,
  UpdateTodoInput,
} from "./Todo";

const TodoFailure = Schema.Union([TodoNotFound, TodoPersistenceError]);

export class TodoRpc extends RpcGroup.make(
  Rpc.make("todo_create", {
    payload: CreateTodoInput,
    success: Todo,
    error: TodoPersistenceError,
  }),
  Rpc.make("todo_list", {
    success: Schema.Array(Todo),
    error: TodoPersistenceError,
  }),
  Rpc.make("todo_get", {
    payload: { id: TodoId },
    success: Todo,
    error: TodoFailure,
  }),
  Rpc.make("todo_update", {
    payload: {
      id: TodoId,
      ...UpdateTodoInput.fields,
    },
    success: Todo,
    error: TodoFailure,
  }),
  Rpc.make("todo_delete", {
    payload: { id: TodoId },
    success: Schema.Void,
    error: TodoFailure,
  }),
) {}
