import { Schema } from "effect";

export const TodoId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("TodoId"),
);
export type TodoId = typeof TodoId.Type;

export const Todo = Schema.Struct({
  id: TodoId,
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
});
export type Todo = typeof Todo.Type;

export const CreateTodoInput = Schema.Struct({
  title: Schema.NonEmptyString,
});
export type CreateTodoInput = typeof CreateTodoInput.Type;

export const UpdateTodoInput = Schema.Struct({
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
});
export type UpdateTodoInput = typeof UpdateTodoInput.Type;

export class TodoNotFound extends Schema.TaggedError<TodoNotFound, { readonly brand: unique symbol }>()(
  "TodoNotFound",
  { id: TodoId },
) {}

export class TodoPersistenceError extends Schema.TaggedError<TodoPersistenceError, { readonly brand: unique symbol }>()(
  "TodoPersistenceError",
  { message: Schema.String },
) {}
