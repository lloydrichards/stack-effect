export const foldkitRpcClientContents = `import { EventRpc } from "@repo/domain/Rpc";
import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";

const SERVER_URL = "http://localhost:9000";

type EventRpcClient = EffectRpcClient.FromGroup<
  typeof EventRpc,
  RpcClientError.RpcClientError
>;

export class RpcClient extends Context.Service<RpcClient, EventRpcClient>()(
  "RpcClient",
) {}

export const RpcProtocolLive = EffectRpcClient.layerProtocolHttp({
  url: \`\${SERVER_URL}/rpc\`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const RpcClientLive = Layer.effect(
  RpcClient,
  EffectRpcClient.make(EventRpc),
).pipe(Layer.provide(RpcProtocolLive));
`;

export const foldkitTicksFeatureContents = `import { TickEvent } from "@repo/domain/Rpc";
import { Effect, Match, Schema, Stream } from "effect";
import { Command, Subscription } from "foldkit";
import type { Html } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";
import { evo } from "foldkit/struct";
import { RpcClient, RpcClientLive } from "../services/rpc-client";

export const Model = Schema.Struct({
  ticksEnabled: Schema.Boolean,
  tickProgress: Schema.String,
  tickCount: Schema.Number,
});
export type Model = typeof Model.Type;

export const ClickedStartTicks = m("ClickedStartTicks");
export const ClickedStopTicks = m("ClickedStopTicks");
export const ReceivedTick = m("ReceivedTick", { event: TickEvent });
export const FailedTickStream = m("FailedTickStream", { error: Schema.String });

export const Message = Schema.Union([
  ClickedStartTicks,
  ClickedStopTicks,
  ReceivedTick,
  FailedTickStream,
]);
export type Message = typeof Message.Type;

export const GotMessage = m("GotTicksMessage", { message: Message });

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [{ ticksEnabled: false, tickProgress: "", tickCount: 0 }, []];

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  Match.valueTags(message, {
    ClickedStartTicks: () =>
      [
        evo(model, {
          ticksEnabled: () => true,
          tickProgress: () => "",
          tickCount: () => 0,
        }),
        [],
      ] as const,
    ClickedStopTicks: () =>
      [evo(model, { ticksEnabled: () => false }), []] as const,
    ReceivedTick: ({ event }) =>
      [
        Match.valueTags(event, {
          starting: () => evo(model, { tickProgress: () => "Starting..." }),
          tick: () =>
            evo(model, {
              tickProgress: (prev) => \`\${prev}.\`,
              tickCount: (prev) => prev + 1,
            }),
          end: () =>
            evo(model, {
              tickProgress: (prev) => \`\${prev} Done!\`,
              ticksEnabled: () => false,
            }),
        }),
        [],
      ] as const,
    FailedTickStream: ({ error }) =>
      [
        evo(model, {
          ticksEnabled: () => false,
          tickProgress: () => \`Error: \${error}\`,
        }),
        [],
      ] as const,
  });

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  tickStream: entry(
    { isEnabled: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isEnabled: model.ticksEnabled }),
      dependenciesToStream: ({ isEnabled }) =>
        isEnabled
          ? Effect.gen(function* () {
              const client = yield* RpcClient;
              return client.tick({ ticks: 10 }).pipe(
                Stream.map((event) => ReceivedTick({ event })),
                Stream.orDie,
              );
            }).pipe(Stream.unwrap, Stream.provide(RpcClientLive))
          : Stream.empty,
    },
  ),
}));

export const view = <ParentMessage>(
  model: Model,
  toParentMessage: (message: Message) => ParentMessage,
): Html => {
  const h = html<ParentMessage>();

  return h.div(
    [h.Class("flex h-full min-h-0 flex-col gap-4")],
    [
      h.div(
        [
          h.Class(
            "rounded-lg border bg-card text-card-foreground shadow-sm h-auto",
          ),
        ],
        [
          h.div(
            [h.Class("flex flex-col space-y-1.5 p-6 border-b border-border")],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight")],
                ["RPC API"],
              ),
            ],
          ),
          h.div(
            [h.Class("p-6 pt-4")],
            [
              h.button(
                [
                  h.Class(
                    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 w-full",
                  ),
                  h.OnClick(toParentMessage(ClickedStartTicks())),
                  ...(model.ticksEnabled ? [h.Disabled(true)] : []),
                ],
                ["Call RPC API"],
              ),
            ],
          ),
        ],
      ),
      model.tickCount > 0 || model.tickProgress
        ? h.div(
            [
              h.Class(
                "flex-1 rounded-lg border bg-card p-6 text-card-foreground shadow-sm",
              ),
            ],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight mb-4")],
                ["RPC API Response"],
              ),
              h.pre(
                [],
                [
                  h.code(
                    [],
                    [
                      \`Event: \${model.ticksEnabled ? "tick" : "end"}\\nMessage: \${model.tickProgress}\`,
                    ],
                  ),
                ],
              ),
            ],
          )
        : h.div(
            [
              h.Class(
                "flex-1 rounded-lg border bg-card p-6 text-card-foreground shadow-sm",
              ),
            ],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight mb-4")],
                ["RPC API Response"],
              ),
              h.p(
                [h.Class("text-sm text-muted-foreground")],
                ["Click the button above to test the RPC API"],
              ),
            ],
          ),
    ],
  );
};
`;
