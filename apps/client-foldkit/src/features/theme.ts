import { Effect, Match, Schema } from "effect";
import { Command } from "foldkit";
import type { Html } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";
import { evo } from "foldkit/struct";

// MODEL

const ThemeSchema = Schema.Literals(["Light", "Dark"]);
export type Theme = typeof ThemeSchema.Type;

export const Model = Schema.Struct({
  theme: ThemeSchema,
});
export type Model = typeof Model.Type;

// MESSAGE
export const ClickedToggleTheme = m("ClickedToggleTheme");
export const CompletedSaveTheme = m("CompletedSaveTheme");

export const Message = Schema.Union([ClickedToggleTheme, CompletedSaveTheme]);
export type Message = typeof Message.Type;

// INIT
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => {
  const storedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme: Theme =
    storedTheme === "dark" || (!storedTheme && prefersDark) ? "Dark" : "Light";

  return [{ theme }, [ApplyTheme({ theme })]];
};

// UPDATE

export const update = (model: Model, message: Message) =>
  Match.valueTags(message, {
    ClickedToggleTheme: () => {
      const next: Theme = model.theme === "Dark" ? "Light" : "Dark";
      return [
        evo(model, { theme: () => next }),
        [ApplyTheme({ theme: next }), SaveTheme({ theme: next })],
      ] as const;
    },
    CompletedSaveTheme: () => [model, []] as const,
  });

// COMMAND

const resolveTheme = (theme: Theme): boolean => theme === "Dark";

export const SaveTheme = Command.define(
  "SaveTheme",
  { theme: ThemeSchema },
  CompletedSaveTheme,
  CompletedSaveTheme,
)(({ theme }) =>
  Effect.sync(() => {
    localStorage.setItem("theme", theme === "Dark" ? "dark" : "light");
    return CompletedSaveTheme();
  }),
);

export const ApplyTheme = Command.define(
  "ApplyTheme",
  { theme: ThemeSchema },
  CompletedSaveTheme,
  CompletedSaveTheme,
)(({ theme }) =>
  Effect.sync(() => {
    document.documentElement.classList.toggle("dark", resolveTheme(theme));
    return CompletedSaveTheme();
  }),
);

// VIEW

export const view = <ParentMessage>(
  model: Model,
  toParentMessage: (message: Message) => ParentMessage,
): Html => {
  const h = html<ParentMessage>();
  const isDark = model.theme === "Dark";

  return h.div(
    [h.Class("absolute right-4 top-4")],
    [
      h.div(
        [
          h.Class(
            "rounded-lg border bg-card p-2 text-card-foreground shadow-sm",
          ),
        ],
        [
          h.div(
            [h.Class("gap-2 flex items-center justify-between px-2")],
            [
              h.label([h.Attribute("for", "theme-toggle")], ["Theme"]),
              h.button(
                [
                  h.Class(
                    `relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${isDark ? "bg-primary" : "bg-input"}`,
                  ),
                  h.OnClick(toParentMessage(ClickedToggleTheme())),
                  h.Attribute("role", "switch"),
                  h.Attribute("aria-checked", isDark ? "true" : "false"),
                  h.Id("theme-toggle"),
                ],
                [
                  h.span(
                    [
                      h.Class(
                        `pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${isDark ? "translate-x-4" : "translate-x-0"}`,
                      ),
                    ],
                    [],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};
