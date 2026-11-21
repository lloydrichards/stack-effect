import { Tasks } from "@repo/domain/Task";
import { Array as Arr, Console, Effect, Schema } from "effect";
import { planTasks } from "./TaskPlan";

const input: unknown = [
  { id: "publish", prerequisites: ["build", "test"] },
  { id: "build", prerequisites: [] },
  { id: "test", prerequisites: [] },
];

await Effect.runPromise(
  Effect.gen(function* () {
    const tasks = yield* Schema.decodeUnknownEffect(Tasks)(input);
    const order = yield* planTasks(tasks);
    yield* Console.log(Arr.join(order, " -> "));
  }),
);
