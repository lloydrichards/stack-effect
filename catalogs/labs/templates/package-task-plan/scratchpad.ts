import { Array as Arr, Console, Effect, Schema } from "effect";
import { planTasks, Tasks } from "./src/TaskPlan.ts";

const tasks = [
  { id: "publish", prerequisites: ["build", "test"] },
  { id: "build", prerequisites: [] },
  { id: "test", prerequisites: [] },
];

await Effect.runPromise(
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeEffect(Tasks)(tasks);
    const order = yield* planTasks(decoded);
    yield* Console.log(Arr.join(order, " -> "));
  }),
);
