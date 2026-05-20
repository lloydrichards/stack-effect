import { Array as A, Effect, Match as M, Schema as S } from "effect";
import { Command, Runtime, Subscription } from "foldkit";
import { type Document, html } from "foldkit/html";
import { m } from "foldkit/message";

import * as Chat from "./features/chat";
import * as Presence from "./features/presence";
import * as Rest from "./features/rest";
import * as Theme from "./features/theme";
import * as Ticks from "./features/ticks";

// MODEL

export const Model = S.Struct({
  theme: Theme.Model,
  rest: Rest.Model,
  ticks: Ticks.Model,
  presence: Presence.Model,
  chat: Chat.Model,
});
export type Model = typeof Model.Type;

// MESSAGE

const GotThemeMessage = m("GotThemeMessage", { message: Theme.Message });
const GotRestMessage = m("GotRestMessage", { message: Rest.Message });
const GotTicksMessage = m("GotTicksMessage", { message: Ticks.Message });
const GotPresenceMessage = m("GotPresenceMessage", {
  message: Presence.Message,
});
const GotChatMessage = m("GotChatMessage", { message: Chat.Message });

export const Message = S.Union([
  GotThemeMessage,
  GotRestMessage,
  GotTicksMessage,
  GotPresenceMessage,
  GotChatMessage,
]);
export type Message = typeof Message.Type;

// UPDATE

export const update = (model: Model, message: Message) =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      GotThemeMessage: ({ message }) => {
        const [nextChild, cmds] = Theme.update(model.theme, message);
        const mappedCommands = A.map(
          cmds,
          Command.mapEffect(
            Effect.map((message) => GotThemeMessage({ message })),
          ),
        );
        return [{ ...model, theme: nextChild }, mappedCommands];
      },
      GotRestMessage: ({ message }) => {
        const [nextChild, cmds] = Rest.update(model.rest, message);
        const mappedCommands = A.map(
          cmds,
          Command.mapEffect(
            Effect.map((message) => GotRestMessage({ message })),
          ),
        );
        return [{ ...model, rest: nextChild }, mappedCommands];
      },
      GotTicksMessage: ({ message }) => {
        const [nextChild, cmds] = Ticks.update(model.ticks, message);
        const mappedCommands = A.map(
          cmds,
          Command.mapEffect(
            Effect.map((message) => GotTicksMessage({ message })),
          ),
        );
        return [{ ...model, ticks: nextChild }, mappedCommands];
      },
      GotPresenceMessage: ({ message }) => {
        const [nextChild, cmds] = Presence.update(model.presence, message);
        const mappedCommands = A.map(
          cmds,
          Command.mapEffect(
            Effect.map((message) => GotPresenceMessage({ message })),
          ),
        );
        return [{ ...model, presence: nextChild }, mappedCommands];
      },
      GotChatMessage: ({ message }) => {
        const [nextChild, cmds] = Chat.update(model.chat, message);
        const mappedCommands = A.map(
          cmds,
          Command.mapEffect(
            Effect.map((message) => GotChatMessage({ message })),
          ),
        );
        return [{ ...model, chat: nextChild }, mappedCommands];
      },
    }),
  );

// INIT

export const init: Runtime.ProgramInit<Model, Message> = () => {
  const [themeModel, themeCmds] = Theme.init();
  const [restModel] = Rest.init();
  const [ticksModel] = Ticks.init();
  const [presenceModel] = Presence.init();
  const [chatModel] = Chat.init();

  const mappedThemeCmds = A.map(
    themeCmds,
    Command.mapEffect(Effect.map((message) => GotThemeMessage({ message }))),
  );

  return [
    {
      theme: themeModel,
      rest: restModel,
      ticks: ticksModel,
      presence: presenceModel,
      chat: chatModel,
    },
    mappedThemeCmds,
  ];
};

// SUBSCRIPTIONS

export const subscriptions = Subscription.aggregate<Model, Message>()(
  Subscription.lift(Ticks.subscriptions)<Model, Message>({
    toChildModel: (model) => model.ticks,
    toParentMessage: (message) => GotTicksMessage({ message }),
  }),
  Subscription.lift(Presence.subscriptions)<Model, Message>({
    toChildModel: (model) => model.presence,
    toParentMessage: (message) => GotPresenceMessage({ message }),
  }),
  Subscription.lift(Chat.subscriptions)<Model, Message>({
    toChildModel: (model) => model.chat,
    toParentMessage: (message) => GotChatMessage({ message }),
  }),
);

// VIEW

export const view = (model: Model): Document => {
  const h = html<Message>();

  return {
    title: "Foldkit Client",
    body: h.div(
      [
        h.Class(
          "relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 p-4 font-mono",
        ),
      ],
      [
        Theme.view(model.theme, (msg) => GotThemeMessage({ message: msg })),

        h.div(
          [h.Class("text-center")],
          [
            h.h1([h.Class("font-black text-5xl")], ["client-foldkit"]),
            h.p(
              [h.Class("text-muted-foreground")],
              ["A typesafe fullstack monorepo"],
            ),
          ],
        ),

        h.div(
          [
            h.Class(
              "grid w-full grid-cols-1 gap-6 auto-rows-[30rem] lg:auto-rows-[22rem] lg:grid-cols-2",
            ),
          ],
          [
            Presence.view(model.presence, (msg) =>
              GotPresenceMessage({ message: msg }),
            ),
            Ticks.view(model.ticks, (msg) => GotTicksMessage({ message: msg })),
            Rest.view(model.rest, (msg) => GotRestMessage({ message: msg })),
            Chat.view(model.chat, (msg) => GotChatMessage({ message: msg })),
          ],
        ),
      ],
    ),
  };
};
