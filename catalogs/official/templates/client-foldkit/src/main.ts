import { Match as M, Schema as S } from "effect";
import { Command, Runtime, Subscription } from "foldkit";
import { type Document, type HtmlBuilder } from "foldkit/html";
import * as Theme from "./features/theme";
import { Init, Views } from "./lib/compose";

export const Model = S.Struct({
  theme: Theme.Model,
});
export type Model = typeof Model.Type;

export const Message = S.Union([Theme.GotMessage]);
export type Message = typeof Message.Type;

export const update = (model: Model, message: Message) =>
  M.value(message).pipe(
    M.withReturnType<{
      readonly model: Model;
      readonly commands: ReadonlyArray<Command.Command<Message>>;
    }>(),
    M.tagsExhaustive({
      GotThemeMessage: ({ message }) => {
        const [nextChild, cmds] = Theme.update(model.theme, message);
        const mappedCommands = Command.mapMessages(cmds, (message) =>
          Theme.GotMessage({ message }),
        );
        return {
          model: { ...model, theme: nextChild },
          commands: mappedCommands,
        };
      },
    }),
  );

export const init: Runtime.ApplicationInit<Model, Message> = () =>
  Init.compose(Init.child(Theme, "theme", Theme.GotMessage));

export const subscriptions = Subscription.aggregate<Model, Message>()();

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  return {
    title: "Foldkit Client",
    body: h.div(
      [
        h.Class(
          "relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 p-4 font-mono",
        ),
      ],
      [
        Theme.view(model.theme, (msg) => Theme.GotMessage({ message: msg }), h),

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
