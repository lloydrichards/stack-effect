import {
  ChatStepLimit,
  ChatStreamPart,
  type UsageMetadata,
} from "@repo/domain/Chat";
import {
  Effect,
  Inspectable,
  Match,
  Ref,
  Schema,
  SchemaGetter,
  Stream,
} from "effect";
import type { Response } from "effect/ai";

const JsonString = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.parseJson<string>({}),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const displayValue = (value: unknown) =>
  typeof value === "string"
    ? Effect.succeed(value)
    : Schema.encodeUnknownEffect(JsonString)(value).pipe(
        Effect.orElseSucceed(() => Inspectable.toStringUnknown(value, 2)),
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

// Chat events come from deltas, tool calls, and finish parts; the other parts repeat or frame them.
const ignorePart = () => Effect.undefined;

export const chatEvents = <E, R>(
  parts: Stream.Stream<Response.AnyPart, E, R>,
  maxSteps: number,
) =>
  Effect.gen(function* () {
    const state = yield* Ref.make(initialState);

    const handlePart = Effect.fnUntraced(function* (
      part: Response.AnyPart,
    ): Effect.fn.Return<ChatStreamPart | undefined, ChatStreamError> {
      // Each native round ends with a finish, including intermediate tool rounds.
      yield* Ref.update(state, (current) =>
        current.finishReason === undefined
          ? current
          : { ...current, sawToolCall: false, finishReason: undefined },
      );

      return yield* Match.value(part).pipe(
        Match.discriminatorsExhaustive("type")({
          "reasoning-delta": ({ delta }) =>
            Effect.succeed(ChatStreamPart.cases.reasoning.make({ delta })),
          "text-delta": ({ delta }) =>
            Effect.succeed(ChatStreamPart.cases.text.make({ delta })),
          "tool-call": (call) =>
            Effect.gen(function* () {
              yield* Ref.update(state, (current) => ({
                ...current,
                pending: new Set([...current.pending, call.id]),
                sawToolCall: true,
              }));
              const input =
                call.params === undefined
                  ? ""
                  : (yield* displayValue(call.params)).trim();

              return ChatStreamPart.cases["tool-start"].make({
                id: call.id,
                name: call.name,
                ...(input ? { input } : {}),
              });
            }),
          "tool-result": (part) =>
            Effect.gen(function* () {
              if (part.preliminary) return;

              yield* Ref.update(state, (current) => {
                const pending = new Set(current.pending);
                pending.delete(part.id);

                return { ...current, pending };
              });
              const result = yield* displayValue(part.result);

              return part.isFailure
                ? ChatStreamPart.cases["tool-failure"].make({
                    id: part.id,
                    name: part.name,
                    error: result,
                  })
                : ChatStreamPart.cases["tool-success"].make({
                    id: part.id,
                    name: part.name,
                    output: result,
                  });
            }),
          error: ({ error }) =>
            Effect.gen(function* () {
              const message = yield* displayValue(error);

              return yield* new ChatStreamError({ message });
            }),
          "tool-approval-request": ({ toolCallId }) =>
            Ref.update(state, (current) => ({
              ...current,
              approval: toolCallId,
            })).pipe(Effect.as(undefined)),
          finish: (part) =>
            Ref.update(state, (current) => {
              const input = part.usage.inputTokens.total;
              const output = part.usage.outputTokens.total;
              const { usage } = current;

              return {
                ...current,
                rounds: current.rounds + 1,
                finishReason: part.reason,
                usage:
                  usage && input !== undefined && output !== undefined
                    ? {
                        promptTokens: usage.promptTokens + input,
                        completionTokens: usage.completionTokens + output,
                        totalTokens: usage.totalTokens + input + output,
                      }
                    : undefined,
              };
            }).pipe(Effect.as(undefined)),
          text: ignorePart,
          "text-start": ignorePart,
          "text-end": ignorePart,
          reasoning: ignorePart,
          "reasoning-start": ignorePart,
          "reasoning-end": ignorePart,
          "tool-params-start": ignorePart,
          "tool-params-delta": ignorePart,
          "tool-params-end": ignorePart,
          file: ignorePart,
          source: ignorePart,
          "response-metadata": ignorePart,
        }),
      );
    });

    const events = parts.pipe(
      Stream.mapEffect(handlePart),
      Stream.filter((part) => part !== undefined),
    );

    const finish = Effect.gen(function* (): Effect.fn.Return<
      ChatStreamPart,
      ChatStreamError
    > {
      const { approval, pending, finishReason, sawToolCall, rounds, usage } =
        yield* Ref.get(state);

      if (approval !== undefined) {
        return yield* new ChatStreamError({
          message: `Tool call ${approval} requires approval, which this chat does not support.`,
        });
      }

      if (pending.size > 0) {
        return yield* new ChatStreamError({
          message: `Tool calls awaiting results: ${[...pending].join(", ")}`,
        });
      }

      const reason = yield* Match.value(finishReason).pipe(
        Match.when(
          "error",
          () =>
            new ChatStreamError({ message: "The model reported an error." }),
        ),
        Match.when(
          "pause",
          () =>
            new ChatStreamError({
              message: "The model paused and this chat cannot resume it.",
            }),
        ),
        Match.when("tool-calls", () =>
          Effect.gen(function* () {
            if (!sawToolCall) {
              return yield* new ChatStreamError({
                message:
                  "The model finished a tool round without calling a tool.",
              });
            }

            if (rounds < maxSteps) {
              return yield* new ChatStreamError({
                message: "The model stream ended without a final finish.",
              });
            }

            return ChatStepLimit.reason;
          }),
        ),
        Match.when(
          undefined,
          () =>
            new ChatStreamError({
              message: "The model stream ended without a final finish.",
            }),
        ),
        Match.whenOr(
          "stop",
          "length",
          "content-filter",
          "other",
          "unknown",
          (reason) => Effect.succeed(reason),
        ),
        Match.exhaustive,
      );

      return ChatStreamPart.cases.finish.make({ reason, usage });
    });

    return Stream.concat(events, Stream.fromEffect(finish));
  }).pipe(Stream.unwrap);
