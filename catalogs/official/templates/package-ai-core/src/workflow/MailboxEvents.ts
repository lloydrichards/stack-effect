import { ChatStreamPart } from "@repo/domain/Chat";
import {
  type Cause,
  Effect,
  Inspectable,
  Queue,
  Schema,
  SchemaGetter,
  String,
} from "effect";

const JsonString = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.parseJson<string>({}),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const stringifyJson = (value: unknown) =>
  Schema.encodeUnknownEffect(JsonString)(value).pipe(
    Effect.orElseSucceed(() => Inspectable.toStringUnknown(value, 2)),
  );

const stringifyValue = (value: unknown) =>
  typeof value === "string" ? Effect.succeed(value) : stringifyJson(value);

const optionalNonEmpty = (value: string) => {
  const input = String.trim(value);
  return String.isEmpty(input) ? {} : { input };
};

type ToolStart = {
  id: string;
  name: string;
  input?: string;
  params?: unknown;
};

type ToolResult = {
  id: string;
  name: string;
  result: unknown;
  isFailure: boolean;
};

const toolStartInput = (part: ToolStart) => {
  if (part.input !== undefined) {
    return Effect.succeed(part.input);
  }

  if (part.params === undefined) {
    return Effect.succeed("");
  }

  return stringifyValue(part.params);
};

/**
 * MailboxEvents - Typed event emitter for ChatStreamPart
 * Provides high-level methods for common event patterns to eliminate boilerplate
 */
export const createMailboxEvents = (
  queue: Queue.Queue<ChatStreamPart, Cause.Done>,
) =>
  ({
    text: (delta: string) =>
      Queue.offer(queue, ChatStreamPart.cases.text.make({ delta })),
    reasoning: (delta: string) =>
      Queue.offer(queue, ChatStreamPart.cases.reasoning.make({ delta })),
    toolStart: (part: ToolStart) =>
      Effect.gen(function* () {
        const input = yield* toolStartInput(part);

        yield* Queue.offer(
          queue,
          ChatStreamPart.cases["tool-start"].make({
            id: part.id,
            name: part.name,
            ...optionalNonEmpty(input),
          }),
        );
      }),
    toolResult: (part: ToolResult) =>
      Effect.gen(function* () {
        const result = yield* stringifyValue(part.result);

        if (part.isFailure) {
          yield* Queue.offer(
            queue,
            ChatStreamPart.cases["tool-failure"].make({
              id: part.id,
              name: part.name,
              error: result,
            }),
          );
          return;
        }

        yield* Queue.offer(
          queue,
          ChatStreamPart.cases["tool-success"].make({
            id: part.id,
            name: part.name,
            output: result,
          }),
        );
      }),
    toolSuccess: (id: string, params: { name: string; output: string }) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-success"].make({
          id,
          name: params.name,
          output: params.output,
        }),
      ),
    toolFailure: (id: string, params: { name: string; error: string }) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-failure"].make({
          id,
          name: params.name,
          error: params.error,
        }),
      ),
    finish: (
      reason: string,
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      },
    ) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases.finish.make({
          reason,
          ...(usage === undefined ? {} : { usage }),
        }),
      ),
    error: (message: string, recoverable = false) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases.error.make({ message, recoverable }),
      ),
    unknownError: (error: unknown, recoverable = false) =>
      Effect.gen(function* () {
        const message =
          typeof error === "string" ? error : yield* stringifyValue(error);

        yield* Queue.offer(
          queue,
          ChatStreamPart.cases.error.make({ message, recoverable }),
        );
      }),
    end: Queue.end(queue),
  }) as const;
