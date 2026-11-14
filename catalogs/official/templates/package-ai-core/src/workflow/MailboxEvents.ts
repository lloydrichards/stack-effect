import {
  ChatStepLimit,
  type ChatStreamPart,
  type UsageMetadata,
} from "@repo/domain/Chat";
import {
  Data,
  Effect,
  Inspectable,
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

class ChatStreamError extends Data.TaggedError("ChatStreamError")<{
  readonly message: string;
}> {}

const streamError = (message: string) =>
  Effect.fail(new ChatStreamError({ message }));

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
          switch (part.type) {
            case "reasoning-delta":
              return { _tag: "reasoning", delta: part.delta };
            case "text-delta":
              return {
                _tag: "text",
                delta: part.delta,
              };
            case "tool-call": {
              pending.add(part.id);
              sawToolCall = true;
              const input =
                part.params === undefined
                  ? ""
                  : (yield* displayValue(part.params)).trim();
              return {
                _tag: "tool-start",
                id: part.id,
                name: part.name,
                ...(input ? { input } : {}),
              };
            }
            case "tool-result": {
              if (part.preliminary) return;
              pending.delete(part.id);
              const result = yield* displayValue(part.result);
              return part.isFailure
                ? {
                    _tag: "tool-failure",
                    id: part.id,
                    name: part.name,
                    error: result,
                  }
                : {
                    _tag: "tool-success",
                    id: part.id,
                    name: part.name,
                    output: result,
                  };
            }
            case "error":
              return yield* streamError(yield* displayValue(part.error));
            case "tool-approval-request":
              approval = part.toolCallId;
              return;
            case "finish": {
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
              return;
            }
            default:
              return;
          }
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
      return { _tag: "finish", reason, usage };
    });
    return Stream.concat(events, Stream.fromEffect(finish));
  });
