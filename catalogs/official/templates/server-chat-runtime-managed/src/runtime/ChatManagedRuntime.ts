import type { ChatId, ChatMessage } from "@repo/domain/Chat";
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
              onNone: () => Effect.void,
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
