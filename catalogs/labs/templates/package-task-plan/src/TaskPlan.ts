// @effect-diagnostics unstableApiUsage:off the Labs example pins Effect while Graph is unstable.

/**
 * Orders tasks by their prerequisites.
 *
 * @module
 */

import { Array as Arr, Effect, Graph, Option, Schema } from "effect";

/**
 * Schema for a task ID. Decodes a non-empty string into a branded ID and
 * encodes it as the original string.
 */
export const TaskId = Schema.NonEmptyString.pipe(Schema.brand("TaskId"));

/**
 * Decoded identifier from {@link TaskId}, used to match tasks to their
 * prerequisites within a plan.
 */
export type TaskId = typeof TaskId.Type;

/**
 * Schema for one task definition. Both `id` and `prerequisites` are required.
 *
 * **Details**
 *
 * Use an empty prerequisite array for a task that can start immediately.
 * {@link planTasks} validates references and cycles across the full task list.
 */
export const Task = Schema.Struct({
  id: TaskId,
  prerequisites: Schema.Array(TaskId),
});

/**
 * Decoded task definition from {@link Task}. Each ID in `prerequisites`
 * identifies a task that must run before this task.
 */
export type Task = typeof Task.Type;

/**
 * Schema for an array of task definitions. Decode raw input with this schema
 * before passing it to {@link planTasks}. An empty array is valid.
 */
export const Tasks = Schema.Array(Task);

/** Raised when multiple definitions use the same `taskId`. */
export class DuplicateTaskId extends Schema.TaggedError<
  DuplicateTaskId,
  { readonly brand: unique symbol }
>()("DuplicateTaskId", { taskId: TaskId }) {}

/** Raised when `taskId` depends on a `prerequisiteId` absent from the input. */
export class MissingPrerequisite extends Schema.TaggedError<
  MissingPrerequisite,
  { readonly brand: unique symbol }
>()("MissingPrerequisite", { taskId: TaskId, prerequisiteId: TaskId }) {}

/** Raised when dependencies form a cycle. The path repeats its starting ID at the end. */
export class TaskCycle extends Schema.TaggedError<
  TaskCycle,
  { readonly brand: unique symbol }
>()("TaskCycle", { path: Schema.Array(TaskId) }) {}

/** Expected failures from {@link planTasks} when decoded tasks cannot be ordered. */
export type TaskPlanError = DuplicateTaskId | MissingPrerequisite | TaskCycle;

/**
 * Returns each task ID once, with every prerequisite before its dependents.
 *
 * **Details**
 *
 * Pass decoded task definitions. The relative order of independent tasks is
 * unspecified. The effect fails with a {@link TaskPlanError} when the task
 * definitions contain duplicate IDs, missing prerequisites, or a cycle.
 *
 * **Example**
 *
 * ```ts
 * import { planTasks, Tasks } from "{{packageName}}/TaskPlan";
 * import { Effect, Schema } from "effect";
 *
 * const tasks = Schema.decodeUnknownSync(Tasks)([
 *   { id: "publish", prerequisites: ["build"] },
 *   { id: "build", prerequisites: [] },
 * ]);
 * const order = Effect.runSync(planTasks(tasks));
 * // order is ["build", "publish"]
 * ```
 */
export const planTasks = Effect.fnUntraced(function* (
  tasks: ReadonlyArray<Task>,
): Effect.fn.Return<ReadonlyArray<TaskId>, TaskPlanError> {
  const mutable = Graph.beginMutation(Graph.directed<TaskId, undefined>());

  const nodes = new Map<
    TaskId,
    {
      readonly index: Graph.NodeIndex;
      readonly prerequisites: ReadonlyArray<TaskId>;
    }
  >();

  for (const { id, prerequisites } of tasks) {
    if (nodes.has(id)) return yield* new DuplicateTaskId({ taskId: id });
    nodes.set(id, { index: Graph.addNode(mutable, id), prerequisites });
  }

  for (const [taskId, { index, prerequisites }] of nodes) {
    for (const prerequisiteId of prerequisites) {
      const prerequisite = nodes.get(prerequisiteId);
      if (prerequisite === undefined)
        return yield* new MissingPrerequisite({ taskId, prerequisiteId });
      Graph.addEdge(mutable, prerequisite.index, index, undefined);
    }
  }

  const graph = Graph.endMutation(mutable);

  const cycle = Graph.findCycle(graph);
  if (Option.isSome(cycle)) {
    return yield* new TaskCycle({
      path: Arr.map(cycle.value.path, (index) =>
        Option.getOrThrow(Graph.getNode(graph, index)),
      ),
    });
  }

  return Array.from(Graph.values(Graph.topo(graph)));
});
