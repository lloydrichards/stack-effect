// @effect-diagnostics unstableApiUsage:off the Labs example pins Effect while Graph is unstable.

/**
 * Orders tasks by their prerequisites.
 *
 * @module
 */

import { Array as Arr, Effect, Graph, Option, Schema } from "effect";

/** Identifies a task within one plan. Use this schema when decoding an ID. */
export const TaskId = Schema.NonEmptyString.pipe(Schema.brand("TaskId"));

export type TaskId = typeof TaskId.Type;

/** Decodes a task definition with its prerequisite IDs. */
export const Task = Schema.Struct({
  id: TaskId,
  prerequisites: Schema.Array(TaskId),
});

export type Task = typeof Task.Type;

/** Decodes a collection of tasks before passing it to `planTasks`. */
export const Tasks = Schema.Array(Task);

/** Reports an ID that occurs more than once in the input. */
export class DuplicateTaskId extends Schema.TaggedError<
  DuplicateTaskId,
  { readonly brand: unique symbol }
>()("DuplicateTaskId", { taskId: TaskId }) {}

/** Reports a prerequisite ID absent from the input. */
export class MissingPrerequisite extends Schema.TaggedError<
  MissingPrerequisite,
  { readonly brand: unique symbol }
>()("MissingPrerequisite", { taskId: TaskId, prerequisiteId: TaskId }) {}

/** Reports a dependency cycle as a path of task IDs. */
export class TaskCycle extends Schema.TaggedError<
  TaskCycle,
  { readonly brand: unique symbol }
>()("TaskCycle", { path: Schema.Array(TaskId) }) {}

/** Lists the typed failures returned by `planTasks`. */
export type TaskPlanError = DuplicateTaskId | MissingPrerequisite | TaskCycle;

/**
 * Returns each task ID once, with every prerequisite before its dependents.
 *
 * **When to use:** Call this after decoding task definitions to determine
 * which tasks must run before others.
 *
 * **Gotchas:** The relative order of independent tasks is unspecified.
 * The effect fails with `DuplicateTaskId`, `MissingPrerequisite`, or
 * `TaskCycle` when the input cannot be ordered.
 *
 * **Example**
 *
 * ```ts
 * import { planTasks, TaskId } from "{{packageName}}/TaskPlan";
 * import { Effect } from "effect";
 *
 * const build = TaskId.make("build");
 * const publish = TaskId.make("publish");
 *
 * const order = Effect.runSync(
 *   planTasks([
 *     { id: publish, prerequisites: [build] },
 *     { id: build, prerequisites: [] },
 *   ]),
 * );
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
