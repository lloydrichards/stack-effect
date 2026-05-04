// Client RPC service
export const clientRpcClientContents = `import { EventRpc } from "@repo/domain/Rpc";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  RpcClient as EffectRpcClient,
  RpcSerialization,
} from "effect/unstable/rpc";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

const ProtocolLive = EffectRpcClient.layerProtocolHttp({
  url: \`\${SERVER_URL}/rpc\`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class RpcClient extends Context.Service<RpcClient>()("RpcClient", {
  make: Effect.gen(function* () {
    return {
      client: yield* EffectRpcClient.make(EventRpc),
    } as const;
  }),
}) {
  static layer = Layer.effect(RpcClient)(RpcClient.make).pipe(
    Layer.provide(ProtocolLive),
  );
}
`;

// Client tick atom
export const clientTickAtomContents = `import type { TickEvent } from "@repo/domain/Rpc";
import { Effect, Layer, Stream } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { Atom } from "effect/unstable/reactivity";
import { RpcClient } from "../rpc-client";

const ENABLE_DEVTOOLS = import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

const RpcLayer = Layer.mergeAll(
  RpcClient.layer,
  ENABLE_DEVTOOLS ? DevTools.layer() : Layer.empty,
);

const runtime = Atom.runtime(RpcLayer);

export const tickAtom = runtime.fn(
  ({ abort = false }: { readonly abort?: boolean }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.logDebug("Starting Tick Atom Stream");
        const rpc = yield* RpcClient;
        return rpc.client.tick({ ticks: 10 });
      }).pipe((self) => (abort ? Effect.interrupt : self)),
    ).pipe(
      Stream.catchTags({
        RpcClientError: (e) => Stream.die(e),
      }),
      Stream.mapAccum(
        () => ({ acc: "" }),
        (
          state,
          event: typeof TickEvent.Type,
        ): readonly [
          { acc: string },
          ReadonlyArray<{ text: string; event: typeof TickEvent.Type }>,
        ] => {
          switch (event._tag) {
            case "starting": {
              const startAcc = "Start";
              return [{ acc: startAcc }, [{ text: startAcc, event }]] as const;
            }
            case "tick": {
              const tickAcc = \`\${state.acc}.\`;
              return [{ acc: tickAcc }, [{ text: tickAcc, event }]] as const;
            }
            case "end": {
              const endAcc = \`\${state.acc} End\`;
              return [{ acc: endAcc }, [{ text: endAcc, event }]] as const;
            }
            default:
              return [state, [{ text: state.acc, event }]] as const;
          }
        },
      ),
    ),
);
`;

// Client RPC card component
export const clientRpcCardContents = `import { useAtom } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { tickAtom } from "@/lib/atoms/tick-atom";

export const RpcCard = () => {
  const [result, search] = useAtom(tickAtom);
  const event = AsyncResult.getOrElse(result, () => null);

  const handleSearch = () => {
    search({ abort: false });
  };
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h2 className="mb-4 font-bold text-lg">RPC API</h2>
        <button
          type="button"
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={handleSearch}
        >
          Call RPC API
        </button>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-muted/50 p-4">
        {event ? (
          <pre className="text-sm">
            <code>
              Event: {event.event._tag}
              {"\\n"}
              Message: {event.text}
            </code>
          </pre>
        ) : (
          <p className="text-muted-foreground text-sm">
            Click the button above to test the RPC API
          </p>
        )}
      </div>
    </div>
  );
};
`;
