// The Labs example pins Effect while Graph is unstable.
// @effect-diagnostics unstableApiUsage:off
import { Array as Arr, Graph, Option, Result, Schema } from "effect";

export const TaskId = Schema.NonEmptyString;
export type TaskId = typeof TaskId.Type;

export const Task = Schema.Struct({
  id: TaskId,
  prerequisites: Schema.Array(TaskId),
});
export type Task = typeof Task.Type;

export const Tasks = Schema.Array(Task);

export type TaskPlanError =
  | { readonly _tag: "DuplicateTaskId"; readonly taskId: TaskId }
  | {
      readonly _tag: "MissingPrerequisite";
      readonly taskId: TaskId;
      readonly prerequisiteId: TaskId;
    }
  | { readonly _tag: "TaskCycle"; readonly path: ReadonlyArray<TaskId> };

export function planTasks(
  tasks: ReadonlyArray<Task>,
): Result.Result<ReadonlyArray<TaskId>, TaskPlanError> {
  const mutable = Graph.beginMutation(Graph.directed<TaskId, undefined>());
  const nodes = new Map<
    TaskId,
    {
      readonly index: Graph.NodeIndex;
      readonly prerequisites: ReadonlyArray<TaskId>;
    }
  >();

  for (const { id, prerequisites } of tasks) {
    if (nodes.has(id))
      return Result.fail({ _tag: "DuplicateTaskId", taskId: id });
    nodes.set(id, { index: Graph.addNode(mutable, id), prerequisites });
  }

  for (const [taskId, { index, prerequisites }] of nodes) {
    for (const prerequisiteId of prerequisites) {
      const prerequisite = nodes.get(prerequisiteId);
      if (prerequisite === undefined)
        return Result.fail({
          _tag: "MissingPrerequisite",
          taskId,
          prerequisiteId,
        });
      Graph.addEdge(mutable, prerequisite.index, index, undefined);
    }
  }

  const graph = Graph.endMutation(mutable);
  const cycle = Graph.findCycle(graph);
  if (Option.isSome(cycle)) {
    return Result.fail({
      _tag: "TaskCycle",
      path: Arr.map(cycle.value.path, (index) =>
        Option.getOrThrow(Graph.getNode(graph, index)),
      ),
    });
  }
  return Result.succeed(Array.from(Graph.values(Graph.topo(graph))));
}
