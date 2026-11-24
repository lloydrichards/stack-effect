import { Schema } from "effect";

export const TaskId = Schema.NonEmptyString.pipe(Schema.brand("TaskId"));

export type TaskId = typeof TaskId.Type;

export const Task = Schema.Struct({
  id: TaskId,
  prerequisites: Schema.Array(TaskId),
});

export type Task = typeof Task.Type;

export const Tasks = Schema.Array(Task);

export class DuplicateTaskId extends Schema.TaggedError<
  DuplicateTaskId,
  { readonly brand: unique symbol }
>()("DuplicateTaskId", { taskId: TaskId }) {}

export class MissingPrerequisite extends Schema.TaggedError<
  MissingPrerequisite,
  { readonly brand: unique symbol }
>()("MissingPrerequisite", { taskId: TaskId, prerequisiteId: TaskId }) {}

export class TaskCycle extends Schema.TaggedError<
  TaskCycle,
  { readonly brand: unique symbol }
>()("TaskCycle", { path: Schema.Array(TaskId) }) {}

export type TaskPlanError = DuplicateTaskId | MissingPrerequisite | TaskCycle;
