import { Effect, Match as M, Schema as S } from "effect";
import { Command, Runtime, Subscription } from "foldkit";
import { type Document, html } from "foldkit/html";

import * as Theme from "./features/theme";
import { Init, Views } from "./lib/compose";

export const Model = S.Struct({
  theme: Theme.Model,
});
export type Model = typeof Model.Type;

export const Message = S.Union([
  Theme.GotMessage,
]);
export type Message = typeof Message.Type;

export const update = (model: Model, message: Message) =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      GotThemeMessage: ({ message }) => {
        const [nextChild, cmds] = Theme.update(model.theme, message);
        const mappedCommands = cmds.map(
          Command.mapEffect(
            Effect.map((message) => Theme.GotMessage({ message })),
          ),
        ) as ReadonlyArray<Command.Command<Message>>;
        return [{ ...model, theme: nextChild }, mappedCommands];
      },
    }),
  );

export const init: Runtime.ProgramInit<Model, Message> = () =>
  Init.compose(
    Init.child(Theme, "theme", Theme.GotMessage),
  );

export const subscriptions = Subscription.aggregate<Model, Message>()();

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
        Theme.view(model.theme, (msg) => Theme.GotMessage({ message: msg })),

        h.div(
          [h.Class("text-center")],
          [
            h.h1([h.Class("font-black text-5xl")], ["{{targetName}}"]),
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
          Views.compose(),
        ),
      ],
    ),
  };
};
