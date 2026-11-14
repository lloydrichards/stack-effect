import {
  ChatPreparationError,
  type ChatFailure,
  type ChatMessage,
  type ChatStreamPart,
} from "@repo/domain/Chat";
import {
  Cause,
  Context,
  Effect,
  Layer,
  Option,
  Queue,
  Schema,
  String,
} from "effect";
import { Chat, Prompt, Toolkit, type Tool } from "effect/ai";
import { ThinkToolkit, ThinkToolkitLive } from "../toolkits/ThinkToolkit";
import { publishChatStream } from "../workflow/MailboxEvents";
// NOTE: Catalog composition appends additional toolkits to this merge call.
export const ChatToolkit = Toolkit.merge(ThinkToolkit);

// NOTE: Catalog composition appends additional toolkit layers to this merge call.
export const ChatToolkitLive = Layer.mergeAll(ThinkToolkitLive);

export function chatPrompt(
  messages: ReadonlyArray<ChatMessage>,
  {
    resources = [],
    prompt = [],
    input = [],
  }: {
    readonly resources?: ReadonlyArray<ChatMessage>;
    readonly prompt?: ReadonlyArray<ChatMessage>;
    readonly input?: ReadonlyArray<ChatMessage>;
  } = {},
): Prompt.Prompt {
  const index =
    messages.at(-1)?.role === "user" ? messages.length - 1 : messages.length;
  return Prompt.fromMessages(
    [
      ...messages.slice(0, index),
      ...resources,
      ...prompt,
      ...input,
      ...messages.slice(index),
    ].map((message) =>
      message.role === "system"
        ? Prompt.systemMessage({ content: message.content })
        : Prompt.makeMessage(message.role, {
            content: [Prompt.textPart({ text: message.content })],
          }),
    ),
  );
}

export const chatErrorPart = Effect.fn("chatErrorPart")(function* <E>(
  cause: Cause.Cause<E>,
) {
  if (Cause.hasInterruptsOnly(cause)) return yield* Effect.interrupt;
  yield* Effect.logError("Chat generation failed", cause);
  const failure = Option.getOrUndefined(Cause.findErrorOption(cause));
  const reason: ChatFailure | undefined = Schema.is(ChatPreparationError)(
    failure,
  )
    ? failure.reason
    : failure instanceof Error
      ? { code: "remote-failure", message: failure.message }
      : undefined;
  return {
    _tag: "error",
    message: reason?.message ?? "Chat generation failed",
    recoverable: reason?.code === "invalid-input",
    reason,
  } satisfies ChatStreamPart;
});

export class AiChatService extends Context.Service<AiChatService>()(
  "AiChatService",
  {
    make: Effect.gen(function* () {
      const localToolkit = yield* ChatToolkit;

      const chatWithToolkit = Effect.fn("chat")(function* <
        Tools extends Record<string, Tool.Any>,
      >(input: Prompt.RawInput, toolkit: Toolkit.WithHandler<Tools>) {
        const queue = yield* Queue.make<ChatStreamPart, Cause.Done>();
        const currentSpan = yield* Effect.currentSpan.pipe(Effect.option);
        const currentParentSpan = yield* Effect.currentParentSpan.pipe(
          Effect.option,
        );
        const generationParentSpan = Option.flatMap(
          currentSpan,
          (span) => span.parent,
        ).pipe(Option.orElse(() => currentParentSpan));

        const history = Prompt.make(input);
        const runGeneration = Effect.gen(function* () {
          const systemMessage = String.stripMargin(`
              |You are a helpful general assistant.
              |You have access to tools and should use them when appropriate.
              |Be concise and direct in your responses.
            `);

          const session = yield* Chat.empty;
          const prompt = history.pipe(Prompt.appendSystem(systemMessage));
          const maxSteps = 12;
          yield* publishChatStream(
            session.streamText({
              prompt,
              toolkit,
              maxSteps,
            }),
            queue,
            maxSteps,
          );
        }).pipe(
          Effect.withSpan("AiChatService.generation", {
            attributes: {
              "chat.messageCount": history.content.length,
            },
          }),
        );

        const tracedGeneration = Option.match(generationParentSpan, {
          onNone: () => runGeneration,
          onSome: (span) => runGeneration.pipe(Effect.withParentSpan(span)),
        });

        yield* Effect.forkChild(
          tracedGeneration.pipe(
            Effect.catchCause((cause) =>
              Effect.flatMap(chatErrorPart(cause), (part) =>
                Queue.offer(queue, part),
              ),
            ),
            Effect.ensuring(Queue.end(queue)),
          ),
        );

        return queue;
      });

      return {
        chat: <Tools extends Record<string, Tool.Any> = {}>(
          input: Prompt.RawInput,
          toolkit?: Toolkit.WithHandler<Tools>,
        ) =>
          toolkit === undefined
            ? chatWithToolkit(input, localToolkit)
            : chatWithToolkit(input, toolkit),
        toolkit: localToolkit,
      } as const;
    }),
  },
) {}

export const AiChatServiceLive = Layer.effect(AiChatService)(
  AiChatService.make,
).pipe(Layer.provide(ChatToolkitLive));
