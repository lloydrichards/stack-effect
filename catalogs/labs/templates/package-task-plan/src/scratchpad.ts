import { Array as Arr, Console, Effect, Schema } from "effect";
import { planTasks, Tasks } from "./TaskPlan";

const input: unknown = [
  { id: "publish", prerequisites: ["build", "test"] },
  { id: "build", prerequisites: [] },
  { id: "test", prerequisites: [] },
];

await Effect.runPromise(
  Effect.gen(function* () {
    const tasks = yield* Schema.decodeUnknownEffect(Tasks)(input);
    const order = yield* Effect.fromResult(planTasks(tasks));
    yield* Console.log(Arr.join(order, " -> "));
  }),
);
