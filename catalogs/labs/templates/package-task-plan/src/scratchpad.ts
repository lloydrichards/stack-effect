import { Tasks } from "@repo/domain/Task";
import { Array as Arr, Console, Effect } from "effect";
import { planTasks } from "./TaskPlan";

const tasks = Tasks.make([
  { id: "publish", prerequisites: ["build", "test"] },
  { id: "build", prerequisites: [] },
  { id: "test", prerequisites: [] },
]);

await Effect.runPromise(
  Effect.gen(function* () {
    const order = yield* planTasks(tasks);
    yield* Console.log(Arr.join(order, " -> "));
  }),
);
