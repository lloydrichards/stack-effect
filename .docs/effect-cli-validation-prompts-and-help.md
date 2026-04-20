# Effect CLI Validation, Prompts, and Help

This guide covers the parts of Effect CLI that move beyond basic parsing: validation, fallbacks, prompts, and generated help.

## Schema validation

Both flags and arguments can be validated with a schema codec.

### Flag example from `Flag.ts`

```ts
import { Schema } from "effect"
import { Flag } from "effect/unstable/cli"

const isEmail = Schema.isIncludes("@", {
  message: "Must be a valid email address"
})

const EmailSchema = Schema.String.pipe(
  Schema.check(isEmail)
)

const emailFlag = Flag.string("email").pipe(
  Flag.withSchema(EmailSchema)
)
```

### Argument example from `Argument.ts`

```ts
import { Schema } from "effect"
import { Argument } from "effect/unstable/cli"

const input = Argument.string("input").pipe(
  Argument.withSchema(Schema.NonEmptyString)
)
```

Use `withSchema(...)` when you want CLI parsing to produce a refined domain value instead of a raw string.

## Fallback config

Missing required inputs can fall back to `effect/Config`.

### Flag fallback

From `Flag.ts`:

```ts
import { Config } from "effect"
import { Flag } from "effect/unstable/cli"

const verbose = Flag.boolean("verbose").pipe(
  Flag.withFallbackConfig(Config.boolean("VERBOSE"))
)
```

### Argument fallback

From `Argument.ts`:

```ts
import { Config } from "effect"
import { Argument } from "effect/unstable/cli"

const repository = Argument.string("repository").pipe(
  Argument.withFallbackConfig(Config.string("REPOSITORY"))
)
```

This is useful when CLI input should override environment-based config, but config should still satisfy missing values.

## Fallback prompts

Missing required inputs can also fall back to an interactive prompt.

### Flag fallback prompt

From `Flag.ts`:

```ts
import { Flag, Prompt } from "effect/unstable/cli"

const name = Flag.string("name").pipe(
  Flag.withFallbackPrompt(Prompt.text({ message: "Name" }))
)
```

### Argument fallback prompt

From `Argument.ts`:

```ts
import { Argument, Prompt } from "effect/unstable/cli"

const filename = Argument.string("filename").pipe(
  Argument.withFallbackPrompt(Prompt.text({ message: "Filename" }))
)
```

## Prompt types

The local `Prompt.ts` implementation includes at least these prompt constructors:

- `Prompt.text(...)`
- `Prompt.confirm(...)`
- `Prompt.select(...)`
- `Prompt.multiSelect(...)`
- `Prompt.toggle(...)`
- `Prompt.succeed(...)`

### Text prompt

```ts
const prompt = Prompt.text({ message: "Project name" })
```

### Confirm prompt

```ts
const prompt = Prompt.confirm({ message: "Continue?" })
```

### Select prompt

```ts
const prompt = Prompt.select({
  message: "Pick a shell",
  choices: [
    { title: "bash", value: "bash" },
    { title: "zsh", value: "zsh" },
    { title: "fish", value: "fish" }
  ]
})
```

### Toggle prompt

```ts
const prompt = Prompt.toggle({
  message: "Enable feature?",
  active: "on",
  inactive: "off"
})
```

## Examples in help output

Effect CLI supports explicit examples through `Command.withExamples(...)`.

From `Command.ts` and `Help.test.ts`:

```ts
const login = Command.make("login").pipe(
  Command.withDescription("Authenticate with Supabase"),
  Command.withExamples([
    { command: "myapp login", description: "Log in with browser OAuth" },
    { command: "myapp login --token sbp_abc123", description: "Log in with a token" },
    { command: "myapp login --logout" }
  ])
)
```

The help renderer turns that into an `EXAMPLES` section.

## Generated help structure

`Help.test.ts` shows several concrete outputs.

### Root help

The root command help includes:

- description
- usage line
- local flags
- global flags
- subcommands

### Command help with positional args

For the `copy` command, the test renders:

```text
USAGE
  mycli copy [flags] <source> <destination>

ARGUMENTS
  source file         Source file or directory
  destination file    Destination path
```

### Variadic args

For the `remove` command, the test renders:

```text
USAGE
  mycli remove [flags] <files...>
```

### Optional positional args

For `admin users create`, the test renders:

```text
USAGE
  mycli admin users create [flags] <username> [<email>]
```

## Built-in global flags

From `GlobalFlag.ts`, the built-ins are:

- `--help`, `-h`
- `--version`
- `--completions`
- `--log-level`

`--completions` accepts shell choices from the reference source:

- `bash`
- `zsh`
- `fish`
- `sh`

`--log-level` is implemented with `Flag.choiceWithValue(...)` and accepts:

- `all`
- `trace`
- `debug`
- `info`
- `warn`
- `warning`
- `error`
- `fatal`
- `none`

## Formatter layer

`GlobalFlag.ts` shows that help and version output are rendered through `CliOutput.Formatter`.

That means help formatting is a service, not just a hard-coded string builder.

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/Flag.ts`
- `.reference/effect/packages/effect/src/unstable/cli/Argument.ts`
- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts`
- `.reference/effect/packages/effect/src/unstable/cli/Command.ts`
- `.reference/effect/packages/effect/src/unstable/cli/GlobalFlag.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Help.test.ts`
