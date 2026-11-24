import type { ChatId, ChatMessage } from "@repo/domain/Chat";
import { ChatWatchEvent } from "@repo/domain/ChatManagedRpc";
import type {
  ChatNotFoundError,
  GenerationInProgressError,
} from "@repo/domain/ChatRpc";
import type { ChatTurnOptions } from "@repo/domain/ChatTurnOptions";
import {
  Context,
  Effect,
  Exit,
  FiberMap,
  HashMap,
  Layer,
  Option,
  PubSub,
  Ref,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import { ChatRuntime } from "./ChatRuntime";
import { ChatSessions } from "./ChatSessions";

type LiveEvent = readonly [ChatId, ChatWatchEvent];

export class ChatManagedRuntime extends Context.Service<
  ChatManagedRuntime,
  {
    readonly send: (input: {
      readonly chatId: ChatId;
      readonly message: ChatMessage;
      readonly options?: ChatTurnOptions;
    }) => Effect.Effect<void, ChatNotFoundError | GenerationInProgressError>;
    readonly watch: (
      chatId: ChatId,
    ) => Stream.Stream<ChatWatchEvent, ChatNotFoundError>;
    readonly interrupt: (
      chatId: ChatId,
    ) => Effect.Effect<void, ChatNotFoundError>;
  }
>()("ChatManagedRuntime") {
  static readonly layer = Layer.effect(
    ChatManagedRuntime,
    Effect.gen(function* () {
      const runtime = yield* ChatRuntime;
      const sessions = yield* ChatSessions;
      const events = yield* Ref.make<
        HashMap.HashMap<ChatId, ReadonlyArray<ChatWatchEvent>>
      >(HashMap.empty());
      const messages = yield* Ref.make<
        HashMap.HashMap<ChatId, ReadonlyArray<ChatMessage>>
      >(HashMap.empty());
      const activeFibers = yield* FiberMap.make<ChatId, void>();
      const liveEvents = yield* PubSub.unbounded<LiveEvent>();
      const eventLock = yield* Semaphore.make(1);

      const publish = (chatId: ChatId, event: ChatWatchEvent) =>
        Effect.gen(function* () {
          yield* Ref.update(events, (current) =>
            HashMap.set(current, chatId, [
              ...Option.getOrElse(HashMap.get(current, chatId), () => []),
              event,
            ]),
          );
          yield* PubSub.publish(liveEvents, [chatId, event] as const);
        }).pipe(Effect.uninterruptible, eventLock.withPermit);

      return ChatManagedRuntime.of({
        send: Effect.fn("ChatManagedRuntime.send")(
          function* ({
            chatId,
            message,
            options,
          }: {
            readonly chatId: ChatId;
            readonly message: ChatMessage;
            readonly options?: ChatTurnOptions;
          }) {
            const reservation = yield* Scope.make();

            yield* Effect.gen(function* () {
              const ai = yield* sessions
                .reserveScoped(chatId)
                .pipe(Scope.provide(reservation));

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

              // A successful fork takes ownership of closing the reservation.
              yield* FiberMap.run(
                activeFibers,
                chatId,
                runtime.generate(history, options, ai).pipe(
                  Stream.tap((part) =>
                    publish(
                      chatId,
                      ChatWatchEvent.cases["assistant-part"].make({ part }),
                    ),
                  ),
                  Stream.runDrain,
                  Effect.onExit((exit) => Scope.close(reservation, exit)),
                ),
              );
            }).pipe(
              Effect.onError((cause) =>
                Scope.close(reservation, Exit.failCause(cause)),
              ),
            );
          },
          // Complete the reservation handoff even if the sending request is interrupted.
          Effect.uninterruptible,
        ),
        watch: (chatId: ChatId) =>
          Stream.unwrap(
            Effect.gen(function* () {
              yield* sessions.ensure(chatId);
              // Capture history and subscribe under the same lock so each event
              // is either in the snapshot or queued for live delivery.
              const { replay, subscription } = yield* eventLock.withPermit(
                Effect.gen(function* () {
                  const current = yield* Ref.get(events);
                  const replay = Option.getOrElse(
                    HashMap.get(current, chatId),
                    () => [],
                  );
                  const subscription = yield* PubSub.subscribe(liveEvents);
                  return { replay, subscription };
                }),
              );
              const live = Stream.fromSubscription(subscription).pipe(
                Stream.filter(([eventChatId]) => eventChatId === chatId),
                Stream.map(([, event]) => event),
              );
              return Stream.fromIterable(replay).pipe(Stream.concat(live));
            }),
          ),
        interrupt: (chatId: ChatId) =>
          Effect.gen(function* () {
            yield* sessions.ensure(chatId);
            yield* FiberMap.remove(activeFibers, chatId);
          }),
      });
    }),
  );
}
