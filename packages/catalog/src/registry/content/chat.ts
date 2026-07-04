export const domainChatContents = `import { Schema } from "effect";

export const ChatId = Schema.String.pipe(Schema.brand("ChatId"));
export type ChatId = Schema.Schema.Type<typeof ChatId>;

export const ChatStreamPart = Schema.TaggedUnion({
  text: {
    delta: Schema.String,
  },
  reasoning: {
    delta: Schema.String,
  },
  "tool-start": {
    id: Schema.String,
    name: Schema.String,
    input: Schema.optional(Schema.String),
  },
  "tool-success": {
    id: Schema.String,
    name: Schema.String,
    output: Schema.String,
  },
  "tool-failure": {
    id: Schema.String,
    name: Schema.String,
    error: Schema.String,
  },
  finish: {
    reason: Schema.String,
    usage: Schema.optional(
      Schema.Struct({
        promptTokens: Schema.Number,
        completionTokens: Schema.Number,
        totalTokens: Schema.Number,
      }),
    ),
  },

  error: {
    message: Schema.String,
    recoverable: Schema.Boolean,
  },
});

export type ChatStreamPart = Schema.Schema.Type<typeof ChatStreamPart>;

export const ChatMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
});

export type ChatMessage = Schema.Schema.Type<typeof ChatMessage>;

export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  input: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "complete", "failed"]),
  result: Schema.optional(Schema.String),
});

export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

export const MessageSegment = Schema.TaggedUnion({
  text: {
    content: Schema.String,
    isComplete: Schema.Boolean,
  },
  "tool-call": {
    tool: ToolCall,
  },
});

export type MessageSegment = Schema.Schema.Type<typeof MessageSegment>;

export const UsageMetadata = Schema.Struct({
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
});

export type UsageMetadata = Schema.Schema.Type<typeof UsageMetadata>;

export const ErrorMetadata = Schema.Struct({
  message: Schema.String,
  recoverable: Schema.Boolean,
});

export type ErrorMetadata = Schema.Schema.Type<typeof ErrorMetadata>;

export const ChatResponse = Schema.TaggedUnion({
  initial: {},
  streaming: {
    segments: Schema.Array(MessageSegment),
    reasoning: Schema.optional(Schema.String),
  },
  complete: {
    segments: Schema.Array(MessageSegment),
    usage: Schema.optional(UsageMetadata),
    finishReason: Schema.String,
  },
  error: {
    segments: Schema.Array(MessageSegment),
    error: ErrorMetadata,
  },
});

export type ChatResponse = Schema.Schema.Type<typeof ChatResponse>;
`;

// Separate ChatRpc group (does NOT touch Rpc.ts)
export const domainChatRpcContents = `import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ChatId, ChatMessage, ChatStreamPart } from "./Chat";

export class ChatNotFoundError extends Schema.TaggedErrorClass<ChatNotFoundError>()(
  "ChatNotFoundError",
  { chatId: ChatId },
) {}

export class GenerationInProgressError extends Schema.TaggedErrorClass<GenerationInProgressError>()(
  "GenerationInProgressError",
  { chatId: ChatId },
) {}

export class ChatRpc extends RpcGroup.make(
  Rpc.make("chat_start", {
    success: Schema.Struct({
      chatId: ChatId,
    }),
  }),
  Rpc.make("chat_ask", {
    payload: {
      chatId: ChatId,
      messages: Schema.Array(ChatMessage),
    },
    success: ChatStreamPart,
    error: Schema.Union([ChatNotFoundError, GenerationInProgressError]),
    stream: true,
  }),
) {}
`;

export const domainChatManagedRpcContents = `import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ChatId, ChatMessage, ChatStreamPart } from "./Chat";
import { ChatNotFoundError, GenerationInProgressError } from "./ChatRpc";

export const ChatWatchEvent = Schema.TaggedUnion({
  "user-message": {
    message: ChatMessage,
  },
  "assistant-part": {
    part: ChatStreamPart,
  },
});

export type ChatWatchEvent = Schema.Schema.Type<typeof ChatWatchEvent>;

export class ChatManagedRpc extends RpcGroup.make(
  Rpc.make("chat_send", {
    payload: {
      chatId: ChatId,
      message: ChatMessage,
    },
    success: Schema.Void,
    error: Schema.Union([ChatNotFoundError, GenerationInProgressError]),
  }),
  Rpc.make("chat_watch", {
    payload: {
      chatId: ChatId,
    },
    success: ChatWatchEvent,
    error: ChatNotFoundError,
    stream: true,
  }),
  Rpc.make("chat_interrupt", {
    payload: {
      chatId: ChatId,
    },
    success: Schema.Void,
    error: ChatNotFoundError,
  }),
) {}
`;

// Server chat handler (separate from EventRpc)
export const serverChatSessionsContents = `import { ChatId } from "@repo/domain/Chat";
import {
  ChatNotFoundError,
  GenerationInProgressError,
} from "@repo/domain/ChatRpc";
import { Context, Effect, HashMap, Layer, Option, Ref } from "effect";

type ChatSession = {
  readonly active: boolean;
};

export class ChatSessions extends Context.Service<ChatSessions>()(
  "ChatSessions",
  {
    make: Effect.gen(function* () {
      const sessions = yield* Ref.make<HashMap.HashMap<ChatId, ChatSession>>(
        HashMap.empty(),
      );

      return {
        start: Effect.gen(function* () {
          const chatId = ChatId.make(crypto.randomUUID());
          const session: ChatSession = { active: false };
          yield* Ref.update(sessions, HashMap.set(chatId, session));
          return { chatId };
        }),
        ensure: (chatId: ChatId) =>
          Ref.get(sessions).pipe(
            Effect.flatMap((current) =>
              Option.match(HashMap.get(current, chatId), {
                onNone: () => Effect.fail(new ChatNotFoundError({ chatId })),
                onSome: () => Effect.succeed(void 0),
              }),
            ),
          ),
        reserve: (chatId: ChatId) =>
          Ref.modify(
            sessions,
            (
              current,
            ): readonly [
              Effect.Effect<
                void,
                ChatNotFoundError | GenerationInProgressError
              >,
              HashMap.HashMap<ChatId, ChatSession>,
            ] =>
              Option.match(HashMap.get(current, chatId), {
                onNone: () =>
                  [
                    Effect.fail(new ChatNotFoundError({ chatId })),
                    current,
                  ] as const,
                onSome: (session) =>
                  session.active
                    ? ([
                        Effect.fail(new GenerationInProgressError({ chatId })),
                        current,
                      ] as const)
                    : ([
                        Effect.succeed(void 0),
                        HashMap.set(current, chatId, {
                          ...session,
                          active: true,
                        }),
                      ] as const),
              }),
          ).pipe(Effect.flatten),
        release: (chatId: ChatId) =>
          Ref.update(sessions, (current) =>
            Option.match(HashMap.get(current, chatId), {
              onNone: () => current,
              onSome: (session) =>
                HashMap.set(current, chatId, { ...session, active: false }),
            }),
          ),
      } as const;
    }),
  },
) {}

export const ChatSessionsLive = Layer.effect(ChatSessions)(ChatSessions.make);
`;

export const serverChatRuntimeContents = `import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import type { ChatId, ChatMessage } from "@repo/domain/Chat";
import { Context, Effect, Layer, Stream } from "effect";
import { Prompt } from "effect/unstable/ai";
import { ChatSessions } from "./ChatSessions";

const toPromptMessage = (message: ChatMessage) => {
  if (message.role === "system") {
    return Prompt.makeMessage(message.role, {
      content: message.content,
    });
  }

  return Prompt.makeMessage(message.role, {
    content: [Prompt.makePart("text", { text: message.content })],
  });
};

export class ChatRuntime extends Context.Service<ChatRuntime>()("ChatRuntime", {
  make: Effect.gen(function* () {
    const chat = yield* AiChatService;
    const sessions = yield* ChatSessions;

    const generate = (messages: ReadonlyArray<ChatMessage>) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* chat.chat(messages.map(toPromptMessage));
          return Stream.fromQueue(queue);
        }),
      ).pipe(Stream.provide(FastModelLive), Stream.orDie);

    return {
      start: sessions.start,
      generate,
      ask: (chatId: ChatId, messages: ReadonlyArray<ChatMessage>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* sessions.reserve(chatId);
            return generate(messages).pipe(
              Stream.ensuring(sessions.release(chatId)),
            );
          }),
        ),
    } as const;
  }),
}) {}

export const ChatRuntimeLive = Layer.effect(ChatRuntime)(ChatRuntime.make).pipe(
  Layer.provide(AiChatServiceLive),
);
`;

export const serverChatContents = `import { ChatRpc } from "@repo/domain/ChatRpc";
import { Effect, Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ChatRuntime, ChatRuntimeLive } from "../runtime/ChatRuntime";

const ChatRpcHandlers = ChatRpc.toLayer(
  Effect.gen(function* () {
    const runtime = yield* ChatRuntime;
    yield* Effect.logInfo("Starting Chat RPC Live Implementation");
    return ChatRpc.of({
      chat_start: () => runtime.start,
      chat_ask: ({ chatId, messages }) => runtime.ask(chatId, messages),
    });
  }),
);

export const ChatRpcLive = RpcServer.layerHttp({
  group: ChatRpc,
  path: "/chat-rpc",
  protocol: "http",
}).pipe(
  Layer.provide(ChatRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(ChatRuntimeLive),
);
`;

export const serverChatManagedRuntimeContents = `import type { ChatId, ChatMessage } from "@repo/domain/Chat";
import { ChatWatchEvent } from "@repo/domain/ChatManagedRpc";
import type {
  ChatNotFoundError,
  GenerationInProgressError,
} from "@repo/domain/ChatRpc";
import {
  Context,
  Effect,
  Fiber,
  HashMap,
  Layer,
  Option,
  PubSub,
  Ref,
  Stream,
} from "effect";
import { ChatRuntime } from "./ChatRuntime";
import { ChatSessions } from "./ChatSessions";

type LiveEvent = readonly [ChatId, ChatWatchEvent];

export class ChatManagedRuntime extends Context.Service<ChatManagedRuntime>()(
  "ChatManagedRuntime",
  {
    make: Effect.gen(function* () {
      const runtime = yield* ChatRuntime;
      const sessions = yield* ChatSessions;
      const events = yield* Ref.make<
        HashMap.HashMap<ChatId, ReadonlyArray<ChatWatchEvent>>
      >(HashMap.empty());
      const messages = yield* Ref.make<
        HashMap.HashMap<ChatId, ReadonlyArray<ChatMessage>>
      >(HashMap.empty());
      const activeFibers = yield* Ref.make<
        HashMap.HashMap<ChatId, Fiber.Fiber<void, never>>
      >(HashMap.empty());
      const liveEvents = yield* PubSub.unbounded<LiveEvent>();

      const publish = (chatId: ChatId, event: ChatWatchEvent) =>
        Effect.gen(function* () {
          yield* Ref.update(events, (current) =>
            HashMap.set(current, chatId, [
              ...Option.getOrElse(HashMap.get(current, chatId), () => []),
              event,
            ]),
          );
          yield* PubSub.publish(liveEvents, [chatId, event] as const);
        });

      const removeActiveFiber = (chatId: ChatId) =>
        Ref.update(activeFibers, HashMap.remove(chatId));

      return {
        send: ({
          chatId,
          message,
        }: {
          readonly chatId: ChatId;
          readonly message: ChatMessage;
        }): Effect.Effect<
          void,
          ChatNotFoundError | GenerationInProgressError
        > =>
          Effect.gen(function* () {
            yield* sessions.reserve(chatId);

            const userEvent = ChatWatchEvent.cases["user-message"].make({
              message,
            });
            yield* publish(chatId, userEvent);

            const history = yield* Ref.modify(messages, (current) => {
              const nextMessages = [
                ...Option.getOrElse(HashMap.get(current, chatId), () => []),
                message,
              ];
              return [
                nextMessages,
                HashMap.set(current, chatId, nextMessages),
              ] as const;
            });

            const fiber = yield* runtime.generate(history).pipe(
              Stream.tap((part) =>
                publish(
                  chatId,
                  ChatWatchEvent.cases["assistant-part"].make({ part }),
                ),
              ),
              Stream.runDrain,
              Effect.ensuring(sessions.release(chatId)),
              Effect.ensuring(removeActiveFiber(chatId)),
              Effect.forkDetach,
            );

            yield* Ref.update(activeFibers, HashMap.set(chatId, fiber));
          }),
        watch: (chatId: ChatId) =>
          Stream.unwrap(
            Effect.gen(function* () {
              yield* sessions.ensure(chatId);
              const replay = yield* Ref.get(events).pipe(
                Effect.map((current) =>
                  Option.getOrElse(HashMap.get(current, chatId), () => []),
                ),
              );
              const live = Stream.fromPubSub(liveEvents).pipe(
                Stream.filter(([eventChatId]) => eventChatId === chatId),
                Stream.map(([, event]) => event),
              );
              return Stream.fromIterable(replay).pipe(Stream.concat(live));
            }),
          ),
        interrupt: (chatId: ChatId) =>
          Effect.gen(function* () {
            yield* sessions.ensure(chatId);
            const fiber = yield* Ref.get(activeFibers).pipe(
              Effect.map(HashMap.get(chatId)),
            );
            yield* Option.match(fiber, {
              onNone: () => Effect.succeed(void 0),
              onSome: Fiber.interrupt,
            });
          }),
      } as const;
    }),
  },
) {}

export const ChatManagedRuntimeLive = Layer.effect(ChatManagedRuntime)(
  ChatManagedRuntime.make,
);
`;

export const serverChatManagedContents = `import { ChatManagedRpc } from "@repo/domain/ChatManagedRpc";
import { Effect, Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import {
  ChatManagedRuntime,
  ChatManagedRuntimeLive,
} from "../runtime/ChatManagedRuntime";
import { ChatRuntimeLive } from "../runtime/ChatRuntime";

const ChatManagedRpcHandlers = ChatManagedRpc.toLayer(
  Effect.gen(function* () {
    const runtime = yield* ChatManagedRuntime;
    yield* Effect.logInfo("Starting Chat Managed RPC Live Implementation");
    return ChatManagedRpc.of({
      chat_send: ({ chatId, message }) => runtime.send({ chatId, message }),
      chat_watch: ({ chatId }) => runtime.watch(chatId),
      chat_interrupt: ({ chatId }) => runtime.interrupt(chatId),
    });
  }),
);

export const ChatManagedRpcLive = RpcServer.layerHttp({
  group: ChatManagedRpc,
  path: "/chat-managed-rpc",
  protocol: "http",
}).pipe(
  Layer.provide(ChatManagedRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(ChatManagedRuntimeLive),
  Layer.provide(ChatRuntimeLive),
);
`;
