import {
  ChatStepLimit,
  ChatStreamPart,
  type UsageMetadata,
} from "@repo/domain/Chat";
import {
  Effect,
  Inspectable,
  Match,
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

const streamError = (message: string) =>
  Effect.fail(new ChatStreamError({ message }));

// Chat events come from deltas, tool calls, and finish parts; the other parts repeat or frame them.
const ignorePart = () => Effect.undefined;

export const chatEvents = <E, R>(
  parts: Stream.Stream<Response.AnyPart, E, R>,
  maxSteps: number,
) =>
  Stream.suspend(() => {
    let rounds = 0;
    let finishReason: Response.FinishReason | undefined;
    let approval: string | undefined;
    let usage: UsageMetadata | undefined = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    const pending = new Set<string>();
    let sawToolCall = false;

    const events = parts.pipe(
      Stream.mapEffect((part) =>
        Effect.gen(function* (): Effect.fn.Return<
          ChatStreamPart | undefined,
          ChatStreamError
        > {
          if (finishReason !== undefined) {
            // Each native round ends with a finish, including intermediate tool rounds.
            sawToolCall = false;
            finishReason = undefined;
          }
          return yield* Match.value(part).pipe(
            Match.discriminatorsExhaustive("type")({
              "reasoning-delta": ({ delta }) =>
                Effect.succeed(ChatStreamPart.cases.reasoning.make({ delta })),
              "text-delta": ({ delta }) =>
                Effect.succeed(ChatStreamPart.cases.text.make({ delta })),
              "tool-call": (call) =>
                Effect.gen(function* () {
                  pending.add(call.id);
                  sawToolCall = true;
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

                  pending.delete(part.id);
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
                Effect.flatMap(displayValue(error), streamError),
              "tool-approval-request": ({ toolCallId }) =>
                Effect.sync(() => {
                  approval = toolCallId;
                  return undefined;
                }),
              finish: (part) =>
                Effect.sync(() => {
                  rounds++;
                  const input = part.usage.inputTokens.total;
                  const output = part.usage.outputTokens.total;
                  usage =
                    usage && input !== undefined && output !== undefined
                      ? {
                          promptTokens: usage.promptTokens + input,
                          completionTokens: usage.completionTokens + output,
                          totalTokens: usage.totalTokens + input + output,
                        }
                      : undefined;

                  finishReason = part.reason;
                  return undefined;
                }),
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
        }),
      ),
      Stream.filter((part) => part !== undefined),
    );

    const finish = Effect.gen(function* (): Effect.fn.Return<
      ChatStreamPart,
      ChatStreamError
    > {
      if (approval !== undefined)
        return yield* streamError(
          `Tool call ${approval} requires approval, which this chat does not support.`,
        );
      if (pending.size > 0)
        return yield* streamError(
          `Tool calls awaiting results: ${[...pending].join(", ")}`,
        );
      if (finishReason === "error")
        return yield* streamError("The model reported an error.");
      if (finishReason === "pause")
        return yield* streamError(
          "The model paused and this chat cannot resume it.",
        );
      if (finishReason === "tool-calls" && !sawToolCall)
        return yield* streamError(
          "The model finished a tool round without calling a tool.",
        );
      if (
        finishReason === undefined ||
        (finishReason === "tool-calls" && rounds < maxSteps)
      ) {
        return yield* streamError(
          "The model stream ended without a final finish.",
        );
      }
      const reason =
        finishReason === "tool-calls" ? ChatStepLimit.reason : finishReason;
      return ChatStreamPart.cases.finish.make({ reason, usage });
    });
    return Stream.concat(events, Stream.fromEffect(finish));
  });
