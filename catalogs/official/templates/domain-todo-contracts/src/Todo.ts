import { Schema } from "effect";

export const TodoId = Schema.String.check(Schema.isUUID());
export type TodoId = Schema.Schema.Type<typeof TodoId>;

export const Todo = Schema.Struct({
  id: TodoId,
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
});
export type Todo = Schema.Schema.Type<typeof Todo>;

export const CreateTodoInput = Schema.Struct({
  title: Schema.NonEmptyString,
});
export type CreateTodoInput = Schema.Schema.Type<typeof CreateTodoInput>;

export const UpdateTodoInput = Schema.Struct({
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
});
export type UpdateTodoInput = Schema.Schema.Type<typeof UpdateTodoInput>;

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: TodoId },
) {}

export class TodoPersistenceError extends Schema.TaggedError<TodoPersistenceError>()(
  "TodoPersistenceError",
  { message: Schema.String },
) {}
