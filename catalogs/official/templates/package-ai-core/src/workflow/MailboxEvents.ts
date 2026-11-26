import {
  ChatStepLimit,
  ChatStreamPart,
  type UsageMetadata,
} from "@repo/domain/Chat";
import { Effect, Inspectable, Match, Option, Schema, Stream } from "effect";
import type { Response } from "effect/ai";

const encodeDisplayValue = Schema.encodeUnknownOption(
  Schema.fromJsonString(Schema.Unknown, { space: 2 }),
);

const displayValue = (value: unknown) =>
  typeof value === "string"
    ? value
    : Option.getOrElse(encodeDisplayValue(value), () =>
        Inspectable.toStringUnknown(value, 2),
      );

class ChatStreamError extends Schema.TaggedError<
  ChatStreamError,
  { readonly brand: unique symbol }
>()("ChatStreamError", { message: Schema.String }) {}

type ChatStreamState = {
  rounds: number;
  finishReason: Response.FinishReason | undefined;
  approval: string | undefined;
  usage: UsageMetadata | undefined;
  pending: ReadonlySet<string>;
  sawToolCall: boolean;
};

const initialState: ChatStreamState = {
  rounds: 0,
  finishReason: undefined,
  approval: undefined,
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  pending: new Set(),
  sawToolCall: false,
};

type Transition = readonly [
  state: ChatStreamState,
  events: ReadonlyArray<ChatStreamPart>,
];

const recordPart = (
  state: ChatStreamState,
  part: Response.AnyPart,
): Transition | ChatStreamError => {
  // The first part after a native finish opens a new round, even for framing parts.
  const current =
    state.finishReason === undefined
      ? state
      : { ...state, finishReason: undefined, sawToolCall: false };

  return Match.value(part).pipe(
    Match.withReturnType<Transition | ChatStreamError>(),
    Match.discriminator("type")(
      "text",
      "text-start",
      "text-end",
      "reasoning",
      "reasoning-start",
      "reasoning-end",
      "tool-params-start",
      "tool-params-delta",
      "tool-params-end",
      "file",
      "source",
      "response-metadata",
      () => [current, []],
    ),
    Match.discriminatorsExhaustive("type")({
      "reasoning-delta": ({ delta }) => [
        current,
        [ChatStreamPart.cases.reasoning.make({ delta })],
      ],
      "text-delta": ({ delta }) => [
        current,
        [ChatStreamPart.cases.text.make({ delta })],
      ],
      "tool-call": ({ id, name, params }) => {
        const input = params === undefined ? "" : displayValue(params).trim();

        return [
          {
            ...current,
            pending: new Set([...current.pending, id]),
            sawToolCall: true,
          },
          [
            ChatStreamPart.cases["tool-start"].make({
              id,
              name,
              ...(input ? { input } : {}),
            }),
          ],
        ];
      },
      "tool-result": ({ id, name, preliminary, isFailure, result }) => {
        if (preliminary) return [current, []];

        const pending = new Set(current.pending);
        pending.delete(id);
        const display = displayValue(result);
        const event = isFailure
          ? ChatStreamPart.cases["tool-failure"].make({
              id,
              name,
              error: display,
            })
          : ChatStreamPart.cases["tool-success"].make({
              id,
              name,
              output: display,
            });

        return [{ ...current, pending }, [event]];
      },
      error: ({ error }) =>
        new ChatStreamError({ message: displayValue(error) }),
      "tool-approval-request": ({ toolCallId }) => [
        { ...current, approval: toolCallId },
        [],
      ],
      finish: (part) => {
        const inputTokens = part.usage.inputTokens.total;
        const outputTokens = part.usage.outputTokens.total;
        const { usage } = current;
        const nextUsage =
          usage !== undefined &&
          inputTokens !== undefined &&
          outputTokens !== undefined
            ? {
                promptTokens: usage.promptTokens + inputTokens,
                completionTokens: usage.completionTokens + outputTokens,
                totalTokens: usage.totalTokens + inputTokens + outputTokens,
              }
            : undefined;

        return [
          {
            ...current,
            rounds: current.rounds + 1,
            finishReason: part.reason,
            usage: nextUsage,
          },
          [],
        ];
      },
    }),
  );
};

const MissingFinish = new ChatStreamError({
  message: "The model stream ended without a final finish.",
});

const finishChat = (
  state: ChatStreamState,
  maxSteps: number,
): Transition | ChatStreamError => {
  const { approval, pending, finishReason, sawToolCall, rounds, usage } = state;
  if (approval !== undefined) {
    return new ChatStreamError({
      message: `Tool call ${approval} requires approval, which this chat does not support.`,
    });
  }

  if (pending.size > 0) {
    return new ChatStreamError({
      message: `Tool calls awaiting results: ${[...pending].join(", ")}`,
    });
  }

  const reason = Match.value(finishReason).pipe(
    Match.when(
      "error",
      () => new ChatStreamError({ message: "The model reported an error." }),
    ),
    Match.when(
      "pause",
      () =>
        new ChatStreamError({
          message: "The model paused and this chat cannot resume it.",
        }),
    ),
    Match.when("tool-calls", () => {
      if (!sawToolCall) {
        return new ChatStreamError({
          message: "The model finished a tool round without calling a tool.",
        });
      }

      return rounds < maxSteps ? MissingFinish : ChatStepLimit.reason;
    }),
    Match.when(undefined, () => MissingFinish),
    Match.whenOr(
      "stop",
      "length",
      "content-filter",
      "other",
      "unknown",
      (reason) => reason,
    ),
    Match.exhaustive,
  );

  return typeof reason === "string"
    ? [state, [ChatStreamPart.cases.finish.make({ reason, usage })]]
    : reason;
};

// Appending a marker limits finalization to normal upstream completion.
const EndOfResponse = Symbol("EndOfResponse");

export const chatEvents = <E, R>(
  parts: Stream.Stream<Response.AnyPart, E, R>,
  maxSteps: number,
) => {
  const transition = Effect.fnUntraced(function* (
    state: ChatStreamState,
    part: Response.AnyPart | typeof EndOfResponse,
  ): Effect.fn.Return<Transition, ChatStreamError> {
    const next =
      part === EndOfResponse
        ? finishChat(state, maxSteps)
        : recordPart(state, part);
    if ("_tag" in next) return yield* next;

    return next;
  });

  return parts.pipe(
    Stream.concat(Stream.succeed(EndOfResponse)),
    Stream.mapAccumEffect(() => initialState, transition),
  );
};
