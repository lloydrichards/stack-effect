export const cliPackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "{{packageName}}": "dist/index.js"
  },
  "scripts": {},
  "dependencies": {
    "@effect/platform-bun": "4.0.0-beta.98",
    "effect": "4.0.0-beta.98"
  },
  "devDependencies": {
    "@effect/language-service": "^0.87.0",
    "@repo/config-typescript": "{{workspaceDependency}}",
    "@types/bun": "^1.2.17",
    "typescript": "6.0.2",
    "vitest": "^4.1.4"
  }
}
`;

export const cliTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;

/**
 * CLI index template with Effect CLI.
 *
 * This is a minimal CLI entrypoint that includes:
 * - A root command with version flag
 * - BunRuntime for execution
 *
 * Additional subcommands are added by modules.
 */
export const cliIndexContents = `import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

const root = Command.make("{{packageName}}");

// NOTE: Modules inject additional subcommands through Command.withSubcommands.
const AllCommands = Command.withSubcommands([]);

// NOTE: Modules append additional runtime layers through Layer.mergeAll.
const RuntimeLayers = Layer.mergeAll(BunServices.layer);

root.pipe(
  AllCommands,
  Command.run({ version: "0.0.0" }),
  Effect.provide(RuntimeLayers),
  BunRuntime.runMain,
);
`;

export const cliDevToolsContents = `import { Config, Effect, Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";

const DevToolsConfig = Config.all({
  enableDevTools: Config.boolean("DEVTOOLS").pipe(Config.withDefault(false)),
  devToolsUrl: Config.string("DEVTOOLS_URL").pipe(
    Config.withDefault("ws://localhost:34437"),
  ),
});

export const DevToolsLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DevToolsConfig;

    if (!config.enableDevTools) {
      return Layer.empty;
    }

    yield* Effect.logDebug("Enabling DevTools Layer");
    return DevTools.layer(config.devToolsUrl);
  }),
);
`;

/**
 * Hello command module template.
 *
 * A simple subcommand that prints a greeting message.
 */
export const cliHelloCommandContents = `import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

const name = Argument.string("name").pipe(
  Argument.optional,
);

const shout = Flag.boolean("shout").pipe(
  Flag.withDescription("Print the greeting in uppercase"),
  Flag.optional,
);

export const hello = Command.make("hello", { name, shout }, ({ name, shout }) =>
  Effect.gen(function* () {
    const greeting = \`Hello, \${Option.getOrElse(name, () => "World")}!\`;
    yield* Console.log(Option.getOrElse(shout, () => false) ? greeting.toUpperCase() : greeting);
  }),
).pipe(Command.withDescription("Print a greeting message"));
`;

export const cliChatDriverContents = `import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import type { ChatMessage, ChatStreamPart } from "@repo/domain/Chat";
import { Array, Context, Effect, Layer, Match, pipe, Stream } from "effect";
import { Prompt } from "effect/unstable/ai";

// NOTE: CLI chat keeps this converter local to avoid depending on server/RPC modules.
const toPromptMessage = (message: ChatMessage) => {
  return pipe(
    Match.value(message.role),
    Match.when("system", () =>
      Prompt.systemMessage({ content: message.content }),
    ),
    Match.when("user", () =>
      Prompt.userMessage({
        content: [Prompt.textPart({ text: message.content })],
      }),
    ),
    Match.when("assistant", () =>
      Prompt.assistantMessage({
        content: [Prompt.textPart({ text: message.content })],
      }),
    ),
    Match.exhaustive,
  );
};

export class TerminalChatDriver extends Context.Service<TerminalChatDriver>()(
  "TerminalChatDriver",
  {
    make: Effect.gen(function* () {
      const chat = yield* AiChatService;

      const streamTurn = (
        messages: ReadonlyArray<ChatMessage>,
      ): Stream.Stream<ChatStreamPart> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const promptMessages: Array<Prompt.Message> = pipe(
              messages,
              Array.map(toPromptMessage),
            );

            const queue = yield* chat
              .chat(promptMessages)
              .pipe(Effect.provide(FastModelLive), Effect.orDie);

            return Stream.fromQueue(queue);
          }),
        );

      return {
        streamTurn,
      } as const;
    }),
  },
) {}

export const TerminalChatDriverLive = Layer.effect(TerminalChatDriver)(
  TerminalChatDriver.make,
).pipe(Layer.provide(AiChatServiceLive));
`;

export const cliAskCommandContents = `import type { ChatStreamPart } from "@repo/domain/Chat";
import {
  Console,
  Effect,
  Match,
  Schema,
  Stdio,
  Stream,
  String,
} from "effect";
import { Argument, Command } from "effect/unstable/cli";
import { TerminalChatDriver, TerminalChatDriverLive } from "../chat/ChatDriver";

const message = Argument.string("message").pipe(
  Argument.withSchema(Schema.NonEmptyString),
  Argument.withDescription("Message to send to the assistant"),
);

const askSystemPrompt = String.stripMargin(\`
    |You are running inside a non-interactive command-line ask command.
    |Produce command output, not a conversation.
    |Return exactly one complete response to the user's request, then stop.
    |Do not invite the user to continue chatting.
    |Do not offer further help.
    |Do not ask follow-up questions unless required for safety or correctness.
    |If the user's entire request is a greeting, return only a brief greeting and no other sentence.
    |Be concise and direct.
  \`);

const failCommand = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

export const ask = Command.make("ask", { message }, ({ message }) =>
  Effect.gen(function* () {
    const driver = yield* TerminalChatDriver;

    yield* driver
      .streamTurn([
        { role: "system", content: askSystemPrompt },
        { role: "user", content: message },
      ])
      .pipe(
        Stream.runForEach((part: ChatStreamPart) =>
          Match.value(part).pipe(
            Match.tag("text", ({ delta }) =>
              Stdio.Stdio.use((stdio) =>
                Stream.make(delta).pipe(Stream.run(stdio.stdout())),
              ),
            ),
            Match.tag("error", ({ message }) => failCommand(message)),
            Match.orElse(() => Effect.void),
          ),
        ),
      );
  }).pipe(
    Effect.catch((error) => failCommand(error.message)),
    Effect.provide(TerminalChatDriverLive),
  ),
).pipe(Command.withDescription("Ask the assistant a single question"));
`;

export const cliTerminalChatCommandContents = `import { Effect, String } from "effect";
import { Command } from "effect/unstable/cli";
import { TerminalChatDriver, TerminalChatDriverLive } from "../chat/ChatDriver";
import { TerminalChat } from "../chat/TerminalChat";

const chatSystemPrompt = String.stripMargin(\`
    |You are a terminal chat assistant. Keep answers direct and practical.
    |Do not format in markdown unless the user explicitly requests it.
  \`);

export const chat = Command.make("chat", {}, () =>
  Effect.gen(function* () {
    const driver = yield* TerminalChatDriver;
    yield* TerminalChat(driver.streamTurn, chatSystemPrompt);
  }).pipe(Effect.provide(TerminalChatDriverLive)),
).pipe(Command.withDescription("Open an interactive terminal chat"));
`;
export const cliTerminalChatContents = `import { type ChatMessage, ChatStreamPart } from "@repo/domain/Chat";
import {
  Array,
  Cause,
  type Context,
  Data,
  Effect,
  Match,
  Number,
  Option,
  Queue,
  Schema,
  Stream,
  String,
  Terminal,
} from "effect";
import { Prompt } from "effect/unstable/cli";
import { Ansi, Box, Cmd, Flex } from "effect-boxes";
import type { TerminalChatDriver } from "./ChatDriver";

const Action = Data.taggedEnum<Prompt.ActionDefinition>();

const TerminalChatEvent = Schema.TaggedUnion({
  StreamPart: { part: ChatStreamPart },
  TurnComplete: {},
  TurnFailed: { message: Schema.String },
});

type TerminalChatEvent = Schema.Schema.Type<typeof TerminalChatEvent>;

const InputAction = Schema.TaggedUnion({
  Submit: {},
  MoveCursor: { cursor: Schema.Number },
  DeleteBackward: {},
  DeleteForward: {},
  InsertText: { text: Schema.String },
  Noop: {},
});

type InputAction = Schema.Schema.Type<typeof InputAction>;

type TerminalChatStreamTurn = Context.Service.Shape<
  typeof TerminalChatDriver
>["streamTurn"];

type TerminalChatState = {
  readonly input: string;
  readonly cursor: number;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly activeTurn: ActiveTurn | null;
  readonly error: string | null;
};

type ActiveTurn = {
  readonly assistantText: string;
  readonly status: string | null;
};

const fallbackwidth = 80;
const assistantRightMargin = 8;
const userLeftMargin = 8;

const clampCursor = (value: number, input: string) =>
  Number.clamp(value, { minimum: 0, maximum: input.length });

const TextContent = (
  content: string,
  alignment: Box.Alignment,
  width: number,
) => Box.para(content, alignment, width);

const isKey = (input: Terminal.UserInput, key: string) =>
  input.key.name === key &&
  !input.key.ctrl &&
  !input.key.meta &&
  !input.key.shift;

const getTerminalInput = (input: {
  readonly input?: Terminal.UserInput;
  readonly event?: Terminal.UserInput;
}): Option.Option<Terminal.UserInput> => {
  const value = input.input ?? input.event;
  return value ? Option.some(value) : Option.none();
};

const moveCursor = (
  state: TerminalChatState,
  cursor: number,
): TerminalChatState => ({
  ...state,
  cursor: clampCursor(cursor, state.input),
  error: null,
});

const withInput = (
  state: TerminalChatState,
  input: string,
  cursor: number,
): TerminalChatState => ({
  ...state,
  input,
  cursor: clampCursor(cursor, input),
  error: null,
});

const next = (state: TerminalChatState) =>
  Effect.succeed(Action.NextFrame({ state }));

const isStreaming = (state: TerminalChatState) => state.activeTurn !== null;

const withActiveTurn = (
  state: TerminalChatState,
  update: (turn: ActiveTurn) => ActiveTurn,
): TerminalChatState => ({
  ...state,
  activeTurn: update(
    state.activeTurn ?? {
      assistantText: "",
      status: null,
    },
  ),
});

const isEnterKey = (input: Terminal.UserInput) =>
  isKey(input, "enter") || isKey(input, "return");

const isPrintableInput = (input: Terminal.UserInput) =>
  Option.getOrElse(input.input, () => "").length === 1 &&
  !input.key.ctrl &&
  !input.key.meta;

const ChatMessageRow = (message: ChatMessage, width: number) =>
  Match.value(message.role).pipe(
    Match.when("user", () =>
      Flex.row(
        [
          Flex.fixed(Box.emptyBox(1, userLeftMargin)),
          Flex.fill((width) =>
            TextContent(message.content, Box.right, Math.max(16, width)).pipe(
              Box.alignHoriz(Box.right, width),
              Box.annotate(Ansi.dim),
            ),
          ),
        ],
        width,
      ),
    ),
    Match.when("assistant", () =>
      Flex.row(
        [
          Flex.fill((width) =>
            TextContent(message.content, Box.left, Math.max(16, width)).pipe(
              Box.moveRight(1),
              Box.annotate(Ansi.white),
            ),
          ),
          Flex.fixed(Box.emptyBox(1, assistantRightMargin)),
        ],
        width,
      ),
    ),
    Match.orElse(() => Box.nullBox),
  );

const AssistantDraft = (state: TerminalChatState, width: number) =>
  state.activeTurn === null || state.activeTurn.assistantText === ""
    ? Box.nullBox
    : Flex.row(
        [
          Flex.fill((width) =>
            TextContent(
              state.activeTurn?.assistantText ?? "",
              Box.left,
              Math.max(16, width),
            ).pipe(Box.moveRight(1), Box.annotate(Ansi.white)),
          ),
          Flex.fixed(Box.emptyBox(1, assistantRightMargin)),
        ],
        width,
      );

const TextInput = (state: TerminalChatState, width: number) => {
  const cursor = clampCursor(state.cursor, state.input);
  const before = state.input.slice(0, cursor);
  const cursorChar = state.input[cursor] ?? " ";
  const after = state.input.slice(cursor + 1);
  const prompt = Box.text("> ").pipe(
    Box.annotate(state.error === null ? Ansi.cyan : Ansi.red),
  );

  return Box.hcat(
    [
      prompt,
      Box.text(before).pipe(Box.annotate(Ansi.white)),
      Box.text(cursorChar).pipe(
        Box.annotate(Ansi.combine(Ansi.bgWhite, Ansi.black)),
      ),
      Box.text(after).pipe(Box.annotate(Ansi.white)),
    ],
    Box.left,
  ).pipe(Box.alignHoriz(Box.left, Math.max(1, width - 2)));
};

const ChatHistory = (messages: ReadonlyArray<ChatMessage>, width: number) =>
  Box.vcat(
    Array.map(messages, (message) => ChatMessageRow(message, width)),
    Box.left,
  );

const StatusLine = (message: string | null) =>
  message === null
    ? Box.nullBox
    : Box.text(message).pipe(Box.annotate(Ansi.dim));

const ErrorLine = (message: string | null, width: number) =>
  message === null
    ? Box.nullBox
    : TextContent(\`x \${message}\`, Box.left, width).pipe(
        Box.moveRight(2),
        Box.annotate(Ansi.red),
      );

const HelpLine = () =>
  Box.text("enter send  /clear clear  /exit exit").pipe(
    Box.moveRight(2),
    Box.annotate(Ansi.dim),
  );

const ChatLayout = (state: TerminalChatState, width: number) =>
  Box.vcat(
    [
      Box.text("Chat").pipe(Box.annotate(Ansi.bold)),
      ChatHistory(state.messages, width),
      AssistantDraft(state, width),
      StatusLine(state.activeTurn?.status ?? null),
      TextInput(state, width).pipe(
        Box.border("rounded", { annotation: Ansi.dim }),
      ),
      ErrorLine(state.error, width),
      HelpLine(),
    ],
    Box.left,
  );

const processStreamPart = (
  state: TerminalChatState,
  part: ChatStreamPart,
): TerminalChatState =>
  Match.value(part).pipe(
    Match.tag("text", ({ delta }) => ({
      ...withActiveTurn(state, (turn) => ({
        ...turn,
        assistantText: turn.assistantText + delta,
        status: null,
      })),
    })),
    Match.tag("error", ({ message }) => ({
      ...state,
      error: message,
      activeTurn: state.activeTurn && {
        ...state.activeTurn,
        status: null,
      },
    })),
    Match.tag("tool-start", ({ name }) =>
      withActiveTurn(state, (turn) => ({
        ...turn,
        status: \`using \${name}...\`,
      })),
    ),
    Match.tag("tool-success", ({ name }) =>
      withActiveTurn(state, (turn) => ({
        ...turn,
        status: \`finished \${name}\`,
      })),
    ),
    Match.tag("tool-failure", ({ name }) =>
      withActiveTurn(state, (turn) => ({
        ...turn,
        status: \`failed \${name}\`,
      })),
    ),
    Match.orElse(() => state),
  );

const completeTurn = (state: TerminalChatState): TerminalChatState => {
  const content = String.trim(state.activeTurn?.assistantText ?? "");
  return {
    ...state,
    messages:
      content === ""
        ? state.messages
        : [...state.messages, { role: "assistant", content }],
    activeTurn: null,
  };
};

const startTurn = (
  streamTurn: TerminalChatStreamTurn,
  systemPrompt: string,
  events: Queue.Queue<TerminalChatEvent>,
  state: TerminalChatState,
) => {
  const userMessage: ChatMessage = {
    role: "user",
    content: String.trim(state.input),
  };
  const nextMessages = [...state.messages, userMessage];
  return streamTurn([
    { role: "system", content: systemPrompt },
    ...nextMessages,
  ]).pipe(
    Stream.runForEach((part) =>
      Queue.offer(events, TerminalChatEvent.cases.StreamPart.make({ part })),
    ),
    Effect.andThen(
      Queue.offer(events, TerminalChatEvent.cases.TurnComplete.make({})),
    ),
    Effect.catchCause((cause) =>
      Queue.offer(
        events,
        TerminalChatEvent.cases.TurnFailed.make({
          message: Cause.pretty(cause),
        }),
      ),
    ),
    Effect.forkDetach({ startImmediately: true }),
    Effect.as({
      ...state,
      input: "",
      cursor: 0,
      messages: nextMessages,
      activeTurn: {
        assistantText: "",
        status: "thinking...",
      },
      error: null,
    }),
  );
};

const handleSubmit = (
  streamTurn: TerminalChatStreamTurn,
  systemPrompt: string,
  events: Queue.Queue<TerminalChatEvent>,
  state: TerminalChatState,
) => {
  const input = String.trim(state.input);

  if (input === "/exit")
    return Effect.succeed(Action.Submit({ value: void 0 }));
  if (isStreaming(state)) return Effect.succeed(Action.Beep());
  if (String.isEmpty(input)) return Effect.succeed(Action.Beep());
  if (input === "/clear") return next({ ...state, messages: [], error: null });

  return Effect.gen(function* () {
    const nextState = yield* startTurn(streamTurn, systemPrompt, events, state);
    return Action.NextFrame({ state: nextState });
  });
};

const toInputAction = (
  input: Terminal.UserInput,
  state: TerminalChatState,
): InputAction =>
  Match.value(input).pipe(
    Match.when(isEnterKey, () => InputAction.cases.Submit.make({})),
    Match.when(
      (input) => isKey(input, "left"),
      () => InputAction.cases.MoveCursor.make({ cursor: state.cursor - 1 }),
    ),
    Match.when(
      (input) => isKey(input, "right"),
      () => InputAction.cases.MoveCursor.make({ cursor: state.cursor + 1 }),
    ),
    Match.when(
      (input) => isKey(input, "home"),
      () => InputAction.cases.MoveCursor.make({ cursor: 0 }),
    ),
    Match.when(
      (input) => isKey(input, "end"),
      () => InputAction.cases.MoveCursor.make({ cursor: state.input.length }),
    ),
    Match.when(
      (input) => isKey(input, "backspace"),
      () => InputAction.cases.DeleteBackward.make({}),
    ),
    Match.when(
      (input) => isKey(input, "delete"),
      () => InputAction.cases.DeleteForward.make({}),
    ),
    Match.when(isPrintableInput, (input) =>
      InputAction.cases.InsertText.make({
        text: Option.getOrElse(input.input, () => ""),
      }),
    ),
    Match.orElse(() => InputAction.cases.Noop.make({})),
  );

const applyInputAction = (
  streamTurn: TerminalChatStreamTurn,
  systemPrompt: string,
  events: Queue.Queue<TerminalChatEvent>,
  state: TerminalChatState,
) =>
  InputAction.match({
    Submit: () => handleSubmit(streamTurn, systemPrompt, events, state),
    MoveCursor: ({ cursor }) => next(moveCursor(state, cursor)),
    DeleteBackward: () =>
      state.cursor === 0
        ? Effect.succeed(Action.Beep())
        : next(
            withInput(
              state,
              state.input.slice(0, state.cursor - 1) +
                state.input.slice(state.cursor),
              state.cursor - 1,
            ),
          ),
    DeleteForward: () =>
      state.cursor >= state.input.length
        ? Effect.succeed(Action.Beep())
        : next(
            withInput(
              state,
              state.input.slice(0, state.cursor) +
                state.input.slice(state.cursor + 1),
              state.cursor,
            ),
          ),
    InsertText: ({ text }) =>
      next(
        withInput(
          state,
          state.input.slice(0, state.cursor) +
            text +
            state.input.slice(state.cursor),
          state.cursor + text.length,
        ),
      ),
    Noop: () => next(state),
  });

const processInput = (
  streamTurn: TerminalChatStreamTurn,
  systemPrompt: string,
  events: Queue.Queue<TerminalChatEvent>,
  input: Terminal.UserInput,
  state: TerminalChatState,
) =>
  applyInputAction(
    streamTurn,
    systemPrompt,
    events,
    state,
  )(toInputAction(input, state));

const processEvent = (
  event: TerminalChatEvent,
  state: TerminalChatState,
): Effect.Effect<Prompt.Action<TerminalChatState, void>> =>
  TerminalChatEvent.match(event, {
    StreamPart: ({ part }) => next(processStreamPart(state, part)),
    TurnComplete: () => next(completeTurn(state)),
    TurnFailed: ({ message }) =>
      next({
        ...state,
        activeTurn: null,
        error: message,
      }),
  });

export const TerminalChat = (
  streamTurn: TerminalChatStreamTurn,
  systemPrompt: string,
) =>
  Effect.gen(function* () {
    const events = yield* Queue.make<TerminalChatEvent>();
    let hasRendered = false;

    return yield* Prompt.custom<TerminalChatState, void, TerminalChatEvent>(
      {
        input: "",
        cursor: 0,
        messages: [],
        activeTurn: null,
        error: null,
      },
      Queue.asDequeue(events),
      {
        render: Effect.fnUntraced(function* (state, action) {
          const terminal = yield* Terminal.Terminal;
          const columns = yield* terminal.columns;
          const innerWidth =
            Number.clamp(columns > 0 ? columns : fallbackwidth, {
              minimum: 32,
              maximum: Number.Number.POSITIVE_INFINITY,
            }) - 2;

          const layout = Action.$match(action, {
            Beep: () => ChatLayout(state, innerWidth),
            Submit: () => ChatLayout(state, innerWidth),
            NextFrame: ({ state: nextState }) =>
              ChatLayout(nextState, innerWidth),
            default: () => ChatLayout(state, innerWidth),
          });
          const clear = hasRendered
            ? Box.combine(Cmd.cursorRestorePosition, Cmd.eraseDown)
            : Box.combine(Cmd.cursorSavePosition, Cmd.cursorHide);
          hasRendered = true;
          const cursor =
            action._tag === "Submit"
              ? Box.combine(Cmd.cursorShow, Cmd.cursorNextLine(1))
              : Cmd.cursorHide;

          return yield* Box.renderPretty(
            Box.combine(clear, layout.pipe(Box.combine(cursor))),
          );
        }),
        process: Effect.fnUntraced(function* (input, state) {
          return yield* Match.value(input).pipe(
            Match.tag("Input", (input) =>
              Option.match(getTerminalInput(input), {
                onNone: () => Effect.succeed(Action.Beep()),
                onSome: (event) =>
                  processInput(streamTurn, systemPrompt, events, event, state),
              }),
            ),
            Match.tag("Event", ({ value }) => processEvent(value, state)),
            Match.exhaustive,
          );
        }),
        clear: () => Effect.succeed(""),
      },
    );
  });
`;
