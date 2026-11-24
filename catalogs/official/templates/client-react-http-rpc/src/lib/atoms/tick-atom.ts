import type { TickEvent } from "@repo/domain/Rpc";
import { Effect, Match, Stream } from "effect";
import { runtime } from "../atom";
import { RpcClient } from "../rpc-client";

export const tickAtom = runtime.fn(
  ({ abort = false }: { readonly abort?: boolean }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.logDebug("Starting Tick Atom Stream");
        const rpc = yield* RpcClient;
        return rpc.client.tick({ ticks: 10 });
      }).pipe(Effect.provide(RpcClient.layer), (self) =>
        abort ? Effect.interrupt : self,
      ),
    ).pipe(
      Stream.catchTags({
        RpcClientError: (e) => Stream.die(e),
      }),
      Stream.mapAccum(
        () => ({ acc: "" }),
        (
          state,
          event: TickEvent,
        ): readonly [
          { acc: string },
          ReadonlyArray<{ text: string; event: TickEvent }>,
        ] => {
          const acc = Match.valueTags(event, {
            starting: () => "Start",
            tick: () => `${state.acc}.`,
            end: () => `${state.acc} End`,
          });
          return [{ acc }, [{ text: acc, event }]];
        },
      ),
    ),
);
