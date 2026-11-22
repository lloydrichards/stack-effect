import { Tasks } from "@repo/domain/Task";
import { Array as Arr, Console, Effect, Schema } from "effect";
import { planTasks } from "./TaskPlan";

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
