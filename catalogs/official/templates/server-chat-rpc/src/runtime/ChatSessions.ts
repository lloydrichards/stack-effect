import { ChatId } from "@repo/domain/Chat";
import {
  ChatNotFoundError,
  GenerationInProgressError,
} from "@repo/domain/ChatRpc";
{{#if runtime=bun}}import { layer as PlatformCryptoLayer } from "@effect/platform-bun/BunCrypto";{{/if}}{{#if runtime=node}}import { layer as PlatformCryptoLayer } from "@effect/platform-node/NodeCrypto";{{/if}}{{#if runtime=deno}}import { layer as PlatformCryptoLayer } from "@effect/platform-deno/DenoCrypto";{{/if}}
import { Context, Crypto, Effect, HashMap, Layer, Option, Ref } from "effect";

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
      const crypto = yield* Crypto.Crypto;

      return {
        start: Effect.gen(function* () {
          const chatId = ChatId.make(
            yield* crypto.randomUUIDv4.pipe(Effect.orDie),
          );
          const session: ChatSession = { active: false };
          yield* Ref.update(sessions, HashMap.set(chatId, session));
          return { chatId };
        }),
        ensure: (chatId: ChatId) =>
          Ref.get(sessions).pipe(
            Effect.flatMap((current) =>
              Option.match(HashMap.get(current, chatId), {
                onNone: () => Effect.fail(new ChatNotFoundError({ chatId })),
                onSome: () => Effect.void,
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
                        Effect.void,
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

export const ChatSessionsLive = Layer.effect(ChatSessions)(ChatSessions.make).pipe(
  Layer.provide(PlatformCryptoLayer),
);
