# Effect CLI Prompt Guide

This guide focuses on `Prompt` from the local Effect reference checkout in `.reference/effect`.

It is specifically about building interactive question flows for CLI tools.

## Where it lives

The module is exported from the unstable CLI namespace:

```ts
import { Prompt } from "effect/unstable/cli"
```

Or by subpath:

```ts
import * as Prompt from "effect/unstable/cli/Prompt"
```

## Core model

A `Prompt<A>` is an interactive computation that eventually produces a value of type `A`.

Run it with:

```ts
const result = yield* Prompt.run(prompt)
```

From the source, `Prompt.run(...)` returns an `Effect` that can fail with `Terminal.QuitError` if the prompt is cancelled.

## The most important APIs for question flows

If you want to build a questionnaire, these are the main pieces:

- `Prompt.text(...)`
- `Prompt.confirm(...)`
- `Prompt.select(...)`
- `Prompt.autoComplete(...)`
- `Prompt.multiSelect(...)`
- `Prompt.integer(...)`
- `Prompt.float(...)`
- `Prompt.password(...)`
- `Prompt.file(...)`
- `Prompt.toggle(...)`
- `Prompt.all(...)`
- `Prompt.flatMap(...)`
- `Prompt.map(...)`
- `Prompt.run(...)`

The two most important composition tools are:

- `Prompt.all(...)` for a fixed set of questions
- `Prompt.flatMap(...)` for branching flows where the next question depends on the previous answer

## Start with one question

### Text input

```ts
import { Effect } from "effect"
import { Prompt } from "effect/unstable/cli"

const askName = Prompt.text({
  message: "Project name"
})

const program = Effect.gen(function*() {
  const name = yield* Prompt.run(askName)
  return name
})
```

`TextOptions` from the source support:

- `message`
- `default`
- `validate`

### Text input with default and validation

```ts
const askPackageName = Prompt.text({
  message: "Package name",
  default: "my-app",
  validate: (value) =>
    value.trim().length === 0
      ? Effect.fail("Package name cannot be empty")
      : Effect.succeed(value)
})
```

From `Prompt.test.ts`, a default text value is editable. The tests also show that `ctrl-u` clears the current input.

## Fixed questionnaires with `Prompt.all(...)`

`Prompt.all(...)` collects multiple prompts into one result.

The source supports both tuple and record forms.

### Record form

This is the best shape for a CLI setup questionnaire.

```ts
import { Effect } from "effect"
import { Prompt } from "effect/unstable/cli"

const questionnaire = Prompt.all({
  name: Prompt.text({
    message: "Project name",
    default: "my-app"
  }),
  packageManager: Prompt.select({
    message: "Package manager",
    choices: [
      { title: "bun", value: "bun" },
      { title: "pnpm", value: "pnpm" },
      { title: "npm", value: "npm" }
    ]
  }),
  installDeps: Prompt.confirm({
    message: "Install dependencies now?"
  })
})

const program = Effect.gen(function*() {
  const answers = yield* Prompt.run(questionnaire)
  return answers
})
```

That returns a single object:

```ts
{
  name: string
  packageManager: "bun" | "pnpm" | "npm"
  installDeps: boolean
}
```

### Tuple form

Use tuple form when positional ordering matters more than field names.

```ts
const prompts = Prompt.all([
  Prompt.text({ message: "Username" }),
  Prompt.password({ message: "Password" })
])
```

The source docs show both tuple and record examples.

## Branching questionnaires with `Prompt.flatMap(...)`

Use `Prompt.flatMap(...)` when later questions depend on earlier answers.

This is the key API for building a question tree.

```ts
import { Prompt } from "effect/unstable/cli"

const packageManagerPrompt = Prompt.select({
  message: "Package manager",
  choices: [
    { title: "bun", value: "bun" },
    { title: "pnpm", value: "pnpm" },
    { title: "npm", value: "npm" }
  ]
})

const questionnaire = packageManagerPrompt.pipe(
  Prompt.flatMap((packageManager) =>
    packageManager === "bun"
      ? Prompt.all({
          packageManager: Prompt.succeed(packageManager),
          useWorkspace: Prompt.confirm({
            message: "Use a Bun workspace?"
          })
        })
      : Prompt.all({
          packageManager: Prompt.succeed(packageManager),
          lockfileOnly: Prompt.confirm({
            message: "Generate lockfile only?"
          })
        })
  )
)
```

`Prompt.succeed(...)` is useful in branching flows when you want to carry an earlier answer forward without asking again.

## Reshaping answers with `Prompt.map(...)`

Use `Prompt.map(...)` when the questionnaire is correct, but you want a nicer final value.

```ts
const answers = Prompt.all({
  name: Prompt.text({ message: "Project name" }),
  scope: Prompt.text({ message: "Scope", default: "acme" })
}).pipe(
  Prompt.map(({ name, scope }) => ({
    name,
    packageName: `@${scope}/${name}`
  }))
)
```

This keeps the prompt layer simple and pushes reshaping into one step at the end.

## Prompt types you will likely use most

### `Prompt.confirm(...)`

Returns `boolean`.

Options from the source include:

- `message`
- `initial`
- `label.confirm`
- `label.deny`
- `placeholder.defaultConfirm`
- `placeholder.defaultDeny`

```ts
const overwrite = Prompt.confirm({
  message: "Overwrite existing files?",
  initial: false
})
```

### `Prompt.select(...)`

Use for choosing one item from a list.

```ts
const template = Prompt.select({
  message: "Template",
  choices: [
    { title: "Minimal", value: "minimal" },
    { title: "Web App", value: "web" },
    { title: "Library", value: "lib", disabled: true }
  ]
})
```

Each choice supports:

- `title`
- `value`
- `description`
- `disabled`
- `selected`

`selected` is mainly relevant for multi-select, though `Prompt.select(...)` also checks for a single default selected option.

### `Prompt.autoComplete(...)`

Use when the choice list is large enough that filtering helps.

```ts
const language = Prompt.autoComplete({
  message: "Choose a language",
  choices: [
    { title: "TypeScript", value: "ts" },
    { title: "Rust", value: "rs" },
    { title: "Kotlin", value: "kt" }
  ]
})
```

From `Prompt.test.ts`, auto-complete:

- filters as the user types
- handles backspace
- clears the filter on `ctrl-u`
- shows an empty message when there are no matches
- beeps if the user tries to submit an invalid or disabled selection

### `Prompt.multiSelect(...)`

Use when the user can pick many values.

```ts
const features = Prompt.multiSelect({
  message: "Choose features",
  choices: [
    { title: "Linting", value: "linting", selected: true },
    { title: "Testing", value: "testing" },
    { title: "Formatting", value: "formatting" }
  ],
  min: 1
})
```

`MultiSelectOptions` from the source include:

- `selectAll`
- `selectNone`
- `inverseSelection`
- `min`
- `max`

### `Prompt.integer(...)` and `Prompt.float(...)`

Use when you want a number, not a string to parse later.

```ts
const port = Prompt.integer({
  message: "Port",
  min: 1,
  max: 65535
})

const rate = Prompt.float({
  message: "Refresh rate",
  min: 0.1,
  max: 60,
  precision: 2
})
```

Numeric prompt options include:

- `message`
- `min`
- `max`
- `incrementBy`
- `decrementBy`
- `validate`

`Prompt.float(...)` also supports `precision`.

### `Prompt.password(...)`

Use when the answer should be redacted.

```ts
const password = Prompt.password({
  message: "Password"
})
```

The returned value is redacted, not a plain string.

From `Prompt.test.ts`, password prompts can also start from a default value and allow editing.

### `Prompt.file(...)`

Use for interactive file selection.

```ts
const configFile = Prompt.file({
  message: "Choose a config file",
  startingPath: "/workspace"
})
```

The source supports:

- `type`
- `message`
- `startingPath`
- `maxPerPage`
- `filter`

From `Prompt.test.ts`, file prompts also support filter-as-you-type behavior.

## Fallback prompts inside CLI parsing

Prompt is not only for fully interactive apps. It also integrates with `Flag` and `Argument`.

### Missing flag value falls back to a prompt

From `Param.test.ts`:

```ts
const prompt = Prompt.text({ message: "Name" })
const flag = Flag.string("name").pipe(Flag.withFallbackPrompt(prompt))
```

If `--name` is provided, the prompt is not shown.

If `--name` is missing, the prompt is shown.

### Missing argument falls back to a prompt

```ts
const prompt = Prompt.text({ message: "File" })
const argument = Argument.string("file").pipe(
  Argument.withFallbackPrompt(prompt)
)
```

The tests show important behavior:

- provided CLI values win over prompts
- fallback prompt creation can be lazy and effectful
- defaults win over fallback prompts
- invalid provided values do not trigger prompts
- cancelling the prompt becomes `MissingOption` or `MissingArgument`
- missing boolean flags do not prompt because they already default to `false`

## Recommended patterns for a questionnaire

### Pattern 1: fixed setup form

Use `Prompt.all({ ... })`.

Good for:

- project scaffolding
- login/setup screens
- collecting 3-8 independent values

### Pattern 2: branching wizard

Use `Prompt.flatMap(...)`.

Good for:

- follow-up questions
- conditional configuration
- skipping irrelevant sections

### Pattern 3: CLI first, prompt second

Use `Flag.withFallbackPrompt(...)` and `Argument.withFallbackPrompt(...)`.

Good for:

- tools that should work both non-interactively and interactively
- scripts where explicit CLI input should override the prompt flow

## A full example

This combines the main pieces into a small interactive setup flow.

```ts
import { Effect } from "effect"
import { Prompt } from "effect/unstable/cli"

const askProjectName = Prompt.text({
  message: "Project name",
  default: "my-app",
  validate: (value) =>
    value.trim().length === 0
      ? Effect.fail("Project name cannot be empty")
      : Effect.succeed(value)
})

const askTemplate = Prompt.select({
  message: "Template",
  choices: [
    { title: "CLI", value: "cli" },
    { title: "Web app", value: "web" },
    { title: "Library", value: "lib" }
  ]
})

const askWebQuestions = (name: string, template: "web") =>
  Prompt.all({
    name: Prompt.succeed(name),
    template: Prompt.succeed(template),
    styling: Prompt.autoComplete({
      message: "Styling",
      choices: [
        { title: "Tailwind", value: "tailwind" },
        { title: "CSS Modules", value: "css-modules" },
        { title: "Vanilla CSS", value: "css" }
      ]
    })
  })

const askNonWebQuestions = (name: string, template: "cli" | "lib") =>
  Prompt.all({
    name: Prompt.succeed(name),
    template: Prompt.succeed(template),
    publish: Prompt.confirm({
      message: "Publish package after build?"
    })
  })

const wizard = askProjectName.pipe(
  Prompt.flatMap((name) =>
    askTemplate.pipe(
      Prompt.flatMap((template) =>
        template === "web"
          ? askWebQuestions(name, template)
          : askNonWebQuestions(name, template)
      )
    )
  )
)

const program = Effect.gen(function*() {
  return yield* Prompt.run(wizard)
})
```

The example above uses the local Prompt APIs, but keeps each branch in its own helper. That is usually the clearest way to build a prompt wizard.

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Prompt.test.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Param.test.ts`
