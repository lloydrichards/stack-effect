// @effect-diagnostics unstableApiUsage:off the Labs example pins Effect while Graph is unstable.

/**
 * Orders tasks by their prerequisites.
 *
 * @module
 */

import {
  DuplicateTaskId,
  MissingPrerequisite,
  type Task,
  TaskCycle,
  type TaskId,
  type TaskPlanError,
} from "@repo/domain/Task";
import { Array as Arr, Effect, Graph, Option } from "effect";

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
 * import { TaskId } from "@repo/domain/Task";
 * import { planTasks } from "{{#if module=package-library}}./examples/task-plan/TaskPlan{{/if}}{{#if noModule=package-library}}@repo/task-plan/TaskPlan{{/if}}";
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
