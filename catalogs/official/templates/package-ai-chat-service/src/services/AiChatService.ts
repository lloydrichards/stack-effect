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
  Stream,
} from "effect";
import { Chat, Prompt, Toolkit, type Tool } from "effect/ai";
import { ThinkToolkit, ThinkToolkitLive } from "../toolkits/ThinkToolkit";
import { chatEvents } from "../workflow/MailboxEvents";

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

const defaultPrompt = Prompt.fromMessages([
  Prompt.systemMessage({
    content:
      "You are a helpful general assistant. Use tools when appropriate. Be concise and direct.",
  }),
]);
const maxSteps = 12;

const streamWithToolkit = <Tools extends Record<string, Tool.Any>>(
  input: Prompt.RawInput,
  toolkit: Toolkit.WithHandler<Tools>,
) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const session = yield* Chat.empty;
      const prompt = Prompt.concat(defaultPrompt, input);
      return chatEvents(
        session.streamText({ prompt, toolkit, maxSteps }),
        maxSteps,
      );
    }),
  ).pipe(
    Stream.withSpan("AiChatService.generation"),
    Stream.catchCause((cause) => Stream.fromEffect(chatErrorPart(cause))),
  );

export class AiChatService extends Context.Service<AiChatService>()(
  "AiChatService",
  {
    make: Effect.gen(function* () {
      const localToolkit = yield* ChatToolkit;

      const stream = <Tools extends Record<string, Tool.Any> = {}>({
        prompt,
        toolkit,
      }: {
        readonly prompt: Prompt.RawInput;
        readonly toolkit?: Toolkit.WithHandler<Tools> | undefined;
      }) =>
        toolkit === undefined
          ? streamWithToolkit(prompt, localToolkit)
          : streamWithToolkit(prompt, toolkit);

      // Existing queue consumers retain ownership through their calling fiber.
      const chat = Effect.fnUntraced(function* <
        Tools extends Record<string, Tool.Any> = {},
      >(prompt: Prompt.RawInput, toolkit?: Toolkit.WithHandler<Tools>) {
        const queue = yield* Queue.bounded<ChatStreamPart, Cause.Done>(16);
        yield* stream({ prompt, toolkit }).pipe(
          Stream.runForEach((part) => Queue.offer(queue, part)),
          Effect.ensuring(Queue.end(queue)),
          Effect.forkChild({ startImmediately: true }),
        );
        return queue;
      });
      return { stream, chat, toolkit: localToolkit } as const;
    }),
  },
) {}

export const AiChatServiceLive = Layer.effect(AiChatService)(
  AiChatService.make,
).pipe(Layer.provide(ChatToolkitLive));
