import { Data, Schema } from "effect";

export const TaskId = Schema.NonEmptyString;
export type TaskId = typeof TaskId.Type;

export const Task = Schema.Struct({
  id: TaskId,
  prerequisites: Schema.Array(TaskId),
});
export type Task = typeof Task.Type;

export const Tasks = Schema.Array(Task);

export class DuplicateTaskId extends Data.TaggedError("DuplicateTaskId")<{
  readonly taskId: TaskId;
}> {}

export class MissingPrerequisite extends Data.TaggedError(
  "MissingPrerequisite",
)<{
  readonly taskId: TaskId;
  readonly prerequisiteId: TaskId;
}> {}

export class TaskCycle extends Data.TaggedError("TaskCycle")<{
  readonly path: ReadonlyArray<TaskId>;
}> {}

export type TaskPlanError = DuplicateTaskId | MissingPrerequisite | TaskCycle;
