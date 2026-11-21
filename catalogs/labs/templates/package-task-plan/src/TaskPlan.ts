// @effect-diagnostics unstableApiUsage:off the Labs example pins Effect while Graph is unstable.
import { Array as Arr, Effect, Graph, Option } from "effect";
import {
  DuplicateTaskId,
  MissingPrerequisite,
  type Task,
  TaskCycle,
  type TaskId,
  type TaskPlanError,
} from "./Task";

export const planTasks = (
  tasks: ReadonlyArray<Task>,
): Effect.Effect<ReadonlyArray<TaskId>, TaskPlanError> =>
  Effect.gen(function* () {
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
