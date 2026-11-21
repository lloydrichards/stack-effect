import { SummaryRequested } from "@repo/domain/SummaryJob";
import { Console, Effect, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { consumeSummary, enqueueSummary } from "../jobs/SummaryQueue";

export const enqueue = Command.make(
  "enqueue",
  { jobId: Flag.String("id"), text: Argument.String("text") },
  (input) =>
    Effect.gen(function* () {
      const job = yield* Schema.decodeEffect(SummaryRequested)(input);
      const id = yield* enqueueSummary(job);
      yield* Console.log(`Enqueued ${id}`);
    }),
).pipe(Command.withDescription("Enqueue a text summary"));

export const consumeOnce = Command.make("consume-once", {}, () =>
  Effect.gen(function* () {
    const { jobId, wordCount } = yield* consumeSummary();
    yield* Console.log(`${jobId}: ${wordCount} words`);
  }),
).pipe(Command.withDescription("Wait for and process one text summary"));
