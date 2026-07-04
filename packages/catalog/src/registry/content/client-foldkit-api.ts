export const foldkitRestFeatureContents = `import { ApiResponse } from "@repo/domain/Api";
import { Effect, Match, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { Command } from "foldkit";
import type { Html } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";
import { ts } from "foldkit/schema";
import { evo } from "foldkit/struct";

const SERVER_URL = "http://localhost:9000";

const ApiInit = ts("ApiInit");
const ApiLoading = ts("ApiLoading");
const ApiSuccess = ts("ApiSuccess", { data: ApiResponse });
const ApiFailure = ts("ApiFailure", { error: Schema.String });

export const ApiAsyncResult = Schema.Union([
  ApiInit,
  ApiLoading,
  ApiSuccess,
  ApiFailure,
]);
export type ApiAsyncResult = typeof ApiAsyncResult.Type;

export const Model = Schema.Struct({
  api: ApiAsyncResult,
});
export type Model = typeof Model.Type;

export const ClickedFetchHello = m("ClickedFetchHello");
export const SucceededFetchHello = m("SucceededFetchHello", {
  data: ApiResponse,
});
export const FailedFetchHello = m("FailedFetchHello", { error: Schema.String });

export const Message = Schema.Union([
  ClickedFetchHello,
  SucceededFetchHello,
  FailedFetchHello,
]);
export type Message = typeof Message.Type;

export const GotMessage = m("GotRestMessage", { message: Message });

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [{ api: ApiInit() }, []];

export const update = (model: Model, message: Message) =>
  Match.valueTags(message, {
    ClickedFetchHello: () =>
      [evo(model, { api: () => ApiLoading() }), [FetchHello({})]] as const,
    SucceededFetchHello: ({ data }) =>
      [evo(model, { api: () => ApiSuccess({ data }) }), []] as const,
    FailedFetchHello: ({ error }) =>
      [evo(model, { api: () => ApiFailure({ error }) }), []] as const,
  });

export const FetchHello = Command.define(
  "FetchHello",
  {},
  SucceededFetchHello,
  FailedFetchHello,
)(() =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request = HttpClientRequest.get(\`\${SERVER_URL}/hello\`);
    const response = yield* client.execute(request);

    if (response.status !== 200) {
      return yield* Effect.fail(
        FailedFetchHello({ error: \`HTTP \${response.status}\` }),
      );
    }

    const json = yield* response.json;
    const data = yield* Schema.decodeUnknownEffect(ApiResponse)(json);
    return SucceededFetchHello({ data });
  }).pipe(
    Effect.catchTag("FailedFetchHello", (error) => Effect.succeed(error)),
    Effect.catch(() =>
      Effect.succeed(FailedFetchHello({ error: "Failed to fetch API" })),
    ),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    Effect.provide(FetchHttpClient.layer),
  ),
);

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
                ["REST API"],
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
                  h.OnClick(toParentMessage(ClickedFetchHello())),
                ],
                ["Call REST API"],
              ),
            ],
          ),
        ],
      ),
      Match.valueTags(model.api, {
        ApiInit: () =>
          h.div(
            [
              h.Class(
                "flex-1 rounded-lg border bg-card p-6 text-card-foreground shadow-sm",
              ),
            ],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight mb-4")],
                ["REST API Response"],
              ),
              h.p(
                [h.Class("text-sm text-muted-foreground")],
                ["Click the button above to test the REST API"],
              ),
            ],
          ),
        ApiLoading: () =>
          h.div(
            [
              h.Class(
                "flex-1 rounded-lg border bg-card p-6 text-card-foreground shadow-sm",
              ),
            ],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight mb-4")],
                ["REST API Response"],
              ),
              h.p([h.Class("text-sm text-muted-foreground")], ["Loading..."]),
            ],
          ),
        ApiSuccess: ({ data }) =>
          h.div(
            [
              h.Class(
                "flex-1 rounded-lg border bg-card p-6 text-card-foreground shadow-sm",
              ),
            ],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight mb-4")],
                ["REST API Response"],
              ),
              h.pre([], [h.code([], [JSON.stringify(data, null, 2)])]),
            ],
          ),
        ApiFailure: ({ error }) =>
          h.div(
            [
              h.Class(
                "flex-1 rounded-lg border bg-card p-6 text-card-foreground shadow-sm",
              ),
            ],
            [
              h.h3(
                [h.Class("font-semibold leading-none tracking-tight mb-4")],
                ["REST API Response"],
              ),
              h.p([h.Class("text-sm text-destructive")], [error]),
            ],
          ),
      }),
    ],
  );
};
`;
