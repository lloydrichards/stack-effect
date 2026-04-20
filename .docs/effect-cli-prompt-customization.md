# Effect CLI Prompt Customization

This guide explains how `Prompt` rendering works in the local Effect reference checkout, what can be customized, and how to build a custom prompt when you want a different TUI.

## Short answer

Yes, customization is possible.

But there are two different layers:

1. terminal IO
2. prompt rendering

The built-in prompt widgets are not theme-configurable through a formatter service.

If you want a different question-and-answer TUI, the main path is `Prompt.custom(...)`.

## How Prompt actually runs

From `Prompt.run(...)` and the internal render loop:

1. get `Terminal.Terminal`
2. get `terminal.readInput`
3. render the current frame as a string
4. call `terminal.display(...)`
5. read a key event
6. update prompt state
7. either render the next frame, beep, or submit

Relevant source:

- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:888-902`
- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:1117-1171`

The loop is driven by three prompt actions:

- `Action.NextFrame({ state })`
- `Action.Submit({ value })`
- `Action.Beep()`

## The Terminal layer

`Prompt` depends on `Terminal.Terminal`.

That service exposes:

- `columns`
- `readInput`
- `readLine`
- `display(text)`

Source:

- `.reference/effect/packages/effect/src/Terminal.ts:23-42`

Node provides the default implementation through `NodeTerminal`.

Source:

- `.reference/effect/packages/platform-node-shared/src/NodeTerminal.ts:20-108`

Tests replace it with a fake terminal service.

Source:

- `.reference/effect/packages/effect/test/unstable/cli/services/MockTerminal.ts:41-81`

## What changing the Terminal gives you

Providing your own `Terminal.Terminal` lets you change:

- where prompt output is written
- where key events come from
- how many columns are reported
- how quit behavior is handled

This is useful for:

- tests
- alternate runtimes
- embedding prompt IO into a different host

But it does not restyle the built-in prompt widgets by itself.

The built-in prompt renderers still generate their own ANSI strings.

## Why built-in prompts are not theme-configurable

The built-in prompts in `Prompt.ts` render directly with ANSI helpers such as:

- `Ansi.annotate(...)`
- `Ansi.cursorHide`
- `Ansi.cursorShow`
- `Ansi.eraseLine`
- `Ansi.eraseLines(...)`

They also use internal figure sets:

- `defaultFigures`
- `windowsFigures`
- `platformFigures`

Source:

- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:472-510`
- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:1219-1279`
- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:3412-3503`
- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:3510-3616`

There is no prompt formatter service similar to `CliOutput.Formatter`.

That formatter exists for help, version, and error output only.

Source:

- `.reference/effect/packages/effect/src/unstable/cli/CliOutput.ts:11-42`

## The real customization point: `Prompt.custom(...)`

`Prompt.custom(...)` lets you build your own prompt from:

- an initial state
- a `render` handler
- a `process` handler
- a `clear` handler

Source:

- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:651-689`

This is the API to use if you want:

- different layout
- different symbols
- different color/styling
- a different question-and-answer format
- a prompt that behaves unlike the built-ins

## Mental model for a custom prompt

Each custom prompt is a tiny state machine.

You define:

1. what the current state looks like
2. how that state is rendered
3. how input changes the state
4. when the prompt submits a final answer
5. how the previous frame is cleared

## Minimal custom prompt example

This example implements a very small yes-or-no prompt with custom text rendering.

It is intentionally minimal so the render loop is easy to see.

```ts
import { Effect, Option } from "effect"
import type * as Terminal from "effect/Terminal"
import { Prompt } from "effect/unstable/cli"

type State = {
  readonly value: boolean
}

const askCustomConfirm = (message: string): Prompt.Prompt<boolean> =>
  Prompt.custom<State, boolean>(
    { value: true },
    {
      render: (state, action) => {
        switch (action._tag) {
          case "Beep": {
            return Effect.succeed("\x07")
          }
          case "NextFrame": {
            const selected = state.value ? "[YES]  no" : " yes  [NO]"
            return Effect.succeed(`\x1b[?25l> ${message}\n  ${selected}`)
          }
          case "Submit": {
            const submitted = action.value ? "YES" : "NO"
            return Effect.succeed(`> ${message}\n  ${submitted}\n`)
          }
        }
      },
      process: (input: Terminal.UserInput, state) => {
        switch (input.key.name) {
          case "left":
          case "y": {
            return Effect.succeed({
              _tag: "NextFrame",
              state: { value: true }
            } as const)
          }
          case "right":
          case "n": {
            return Effect.succeed({
              _tag: "NextFrame",
              state: { value: false }
            } as const)
          }
          case "enter":
          case "return": {
            return Effect.succeed({
              _tag: "Submit",
              value: state.value
            } as const)
          }
          default: {
            return Effect.succeed({ _tag: "Beep" } as const)
          }
        }
      },
      clear: () => Effect.succeed("\x1b[2K\x1b[1A\x1b[2K\x1b[G")
    }
  )
```

What this example shows:

- `render` returns the entire frame as a string
- `process` interprets key input and returns the next action
- `clear` erases the previous frame
- submission returns the final typed value

## A more idiomatic variant

The built-in prompts use ANSI helpers and `Terminal.columns` to clear correctly across line wrapping.

If you want a production-quality custom prompt, follow the built-in pattern:

1. render with ANSI helpers
2. ask the terminal for `columns`
3. calculate how many rows the prompt occupies
4. erase the previous frame precisely
5. restore the cursor on completion

You can study these built-in implementations for reference:

- text prompt: `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:3412-3503`
- confirm prompt: `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:1219-1297`
- toggle prompt: `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts:3510-3616`

## Important limitation

If you want to restyle `Prompt.text(...)`, `Prompt.select(...)`, or `Prompt.multiSelect(...)` directly, there is no simple config hook for that in the local source.

Your choices are:

1. accept the built-in TUI
2. fork or copy the built-in prompt implementation and change its render functions
3. write your own prompt with `Prompt.custom(...)`

## Best practical strategy

If you only want a slightly different look:

1. study the closest built-in prompt in `Prompt.ts`
2. copy that prompt logic into your codebase
3. adjust the render and clear behavior

If you want a genuinely different TUI:

1. define your own prompt state
2. implement it with `Prompt.custom(...)`
3. compose it with `Prompt.all(...)`, `Prompt.flatMap(...)`, and `Prompt.map(...)`

If you want to change the IO backend as well:

1. provide your own `Terminal.Terminal`
2. keep or replace the prompt renderers separately

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts`
- `.reference/effect/packages/effect/src/Terminal.ts`
- `.reference/effect/packages/platform-node-shared/src/NodeTerminal.ts`
- `.reference/effect/packages/effect/test/unstable/cli/services/MockTerminal.ts`
- `.reference/effect/packages/effect/src/unstable/cli/internal/ansi.ts`
- `.reference/effect/packages/effect/src/unstable/cli/CliOutput.ts`
