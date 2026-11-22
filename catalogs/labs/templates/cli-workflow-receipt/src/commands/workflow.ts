// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { Receipt, ReceiptId } from "@repo/workflow/Receipt";
import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import {
  DurableReceiptLive,
  MemoryReceiptLive,
} from "../workflows/ReceiptRuntime";

export const workflow = Command.make(
  "workflow",
  {
    id: Argument.String("id").pipe(Argument.withSchema(ReceiptId)),
    mode: Flag.Literals("mode", ["memory", "suspend", "resume"]).pipe(
      Flag.withDefault("memory"),
    ),
  },
  ({ id, mode }) =>
    Effect.gen(function* () {
      if (mode === "suspend") {
        const executionId = yield* Receipt.execute({ id }, { discard: true });
        const status = yield* Effect.gen(function* () {
          while (true) {
            const status = yield* Receipt.poll(executionId);
            if (Option.isSome(status)) return status.value._tag;
            yield* Effect.sleep("100 millis");
          }
        }).pipe(Effect.timeout("15 seconds"));
        if (status === "Suspended") {
          yield* Console.log(`Suspended ${id}`);
        } else {
          yield* Receipt.execute({ id });
          yield* Console.log(`Confirmed ${id}`);
        }
        return;
      }

      const confirmed = yield* Receipt.execute({ id });
      yield* Console.log(`Confirmed ${confirmed}`);
    }).pipe(
      Effect.provide(
        mode === "memory" ? MemoryReceiptLive : DurableReceiptLive,
      ),
    ),
).pipe(Command.withDescription("Record and confirm a workflow receipt"));
