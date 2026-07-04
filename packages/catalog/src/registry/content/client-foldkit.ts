export const foldkitPackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "@effect/platform-browser": "4.0.0-beta.93",
    "@fontsource-variable/jetbrains-mono": "^5.2.5",
    "effect": "4.0.0-beta.93",
    "foldkit": "^0.101.0",
    "shadcn": "^4.1.0",
    "tailwindcss": "^4.1.13",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@foldkit/vite-plugin": "^0.6.0",
    "@repo/config-typescript": "workspace:*",
    "@tailwindcss/vite": "^4.1.13",
    "typescript": "6.0.2",
    "vite": "^8.0.10",
    "vitest": "^4.1.4"
  }
}
`;

export const foldkitIndexHtmlContents = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{targetName}}</title>
    <script src="/theme-init.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/entry.ts"></script>
  </body>
</html>
`;

export const foldkitThemeInitContents = `(function () {
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (stored === "dark" || (!stored && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export const foldkitViteConfigContents = `import tailwindcss from "@tailwindcss/vite";
import foldkit from "@foldkit/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [foldkit(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
  },
});
`;

export const foldkitTsconfigContents = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@repo/config-typescript/vite.json",
  "compilerOptions": {
    "outDir": "dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "references": [{ "path": "./tsconfig.config.json" }],
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist", "dist-node"]
}
`;

export const foldkitTsconfigConfigContents = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "composite": true,
    "types": ["bun", "vite/client"],
    "outDir": "dist-node"
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
`;

export const foldkitStylesContents = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/jetbrains-mono";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --font-heading: var(--font-mono);
  --font-mono: "JetBrains Mono Variable", monospace;
}
`;

export const foldkitEntryContents = `import { Runtime } from "foldkit";

import { init, Message, Model, subscriptions, update, view } from "./main";

const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById("root"),
  devTools: {
    Message,
  },
});

Runtime.run(program);
`;

export const foldkitMainContents = `import { Effect, Match as M, Schema as S } from "effect";
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
`;

export const foldkitThemeFeatureContents = `import { Effect, Match, Schema } from "effect";
import { Command } from "foldkit";
import type { Html } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";
import { evo } from "foldkit/struct";

const ThemeSchema = Schema.Literals(["Light", "Dark"]);
export type Theme = typeof ThemeSchema.Type;

export const Model = Schema.Struct({
  theme: ThemeSchema,
});
export type Model = typeof Model.Type;

export const ClickedToggleTheme = m("ClickedToggleTheme");
export const CompletedSaveTheme = m("CompletedSaveTheme");

export const Message = Schema.Union([ClickedToggleTheme, CompletedSaveTheme]);
export type Message = typeof Message.Type;

export const GotMessage = m("GotThemeMessage", { message: Message });

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
                    \`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors \${isDark ? "bg-primary" : "bg-input"}\`,
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
                        \`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform \${isDark ? "translate-x-4" : "translate-x-0"}\`,
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
`;

export const foldkitComposeContents = `import { Array as Arr, Effect, Record } from "effect";
import type { Html } from "foldkit/html";

/**
 * Composition helpers for foldkit TEA architecture.
 * Used by the scaffold to compose child features into the root main.ts.
 */

/** Structural shape of a Command without the conditional type indirection. */
type AnyCommand<T> = Readonly<{
  name: string;
  args?: Record<string, unknown>;
  effect: Effect.Effect<T>;
}>;

export const Init = {
  child: <Model, Message, ParentMessage>(
    mod: {
      readonly init: () => readonly [Model, ReadonlyArray<AnyCommand<Message>>];
    },
    key: string,
    toParentMessage: (input: { message: Message }) => ParentMessage,
  ) => {
    const [model, cmds] = mod.init();
    const commands: ReadonlyArray<AnyCommand<ParentMessage>> = Arr.map(
      cmds,
      (cmd): AnyCommand<ParentMessage> => ({
        name: cmd.name,
        ...(cmd.args !== undefined ? { args: cmd.args } : {}),
        effect: Effect.map(cmd.effect, (message) =>
          toParentMessage({ message }),
        ),
      }),
    );
    return { key, model, commands };
  },

  compose: <
    ParentModel extends Record<string, unknown>,
    ParentMessage,
    Children extends ReadonlyArray<{
      readonly key: string;
      readonly model: unknown;
      readonly commands: ReadonlyArray<AnyCommand<ParentMessage>>;
    }>,
  >(
    ...children: Children
  ) => {
    const model = Record.fromIterableWith(children, (child) => [
      child.key,
      child.model,
    ]) as ParentModel;
    const commands = Arr.flatMap(children, (child) => child.commands);
    return [model, commands] as const;
  },
};

export const Views = {
  compose: (...children: ReadonlyArray<Html>): ReadonlyArray<Html> => children,
};
`;
