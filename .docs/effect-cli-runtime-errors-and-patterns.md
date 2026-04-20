# Effect CLI Execution, Subcommands, and Semantics

This guide covers how Effect CLI executes commands, how subcommands work, and which parsing rules are locked in by the reference tests.

## `Command.run` vs `Command.runWith`

There are two main execution APIs in the reference source.

### `Command.run(command, { version })`

Use this for a real CLI entrypoint.

It reads process arguments, wires in built-in global flags, and returns a runnable `Effect`.

Reference entrypoints:

- `.reference/effect/packages/tools/utils/src/bin.ts`
- `.reference/effect/packages/tools/bundle/src/bin.ts`

### `Command.runWith(command, { version })`

Use this when you want a function that accepts `ReadonlyArray<string>`.

From the source docs:

```ts
const runCommand = Command.runWith(greet, { version: "1.0.0" })

yield* runCommand(["--name", "Alice", "--count", "2"])
yield* runCommand(["--help"])
yield* runCommand(["--version"])
```

This is useful for tests and for understanding parsing behavior without running a full executable.

## Subcommands

Use `Command.withSubcommands(...)` to build a command tree.

From the `Command.ts` docs:

```ts
const git = Command.make("git").pipe(
  Command.withSharedFlags({
    verbose: Flag.boolean("verbose")
  })
)

const clone = Command.make("clone", {
  repository: Flag.string("repo")
}, (config) =>
  Effect.gen(function*() {
    const parent = yield* git
    if (parent.verbose) {
      yield* Console.log("Verbose mode enabled")
    }
    yield* Console.log(`Cloning ${config.repository}`)
  }))

const app = git.pipe(Command.withSubcommands([clone]))
```

The important detail is in the example itself: a subcommand handler can `yield*` the parent command to access shared parent config.

## Shared flags vs local flags

The semantics file makes this distinction explicit.

### Shared parent flags

Flags defined with `Command.withSharedFlags(...)` are available to subcommands.

The semantics doc says these shared flags may appear before or after the subcommand token.

Examples from `SEMANTICS.md`:

```bash
tool --global install --pkg cowsay
tool install --pkg cowsay --global
```

### Local parent flags

Local parent flags are not inherited by subcommands.

If a flag belongs only to the parent command, using it on a subcommand path fails.

## Parsing rules locked in by tests

The reference repo includes a dedicated semantics document. These are the key rules it calls out.

### 1. Shared parent flags can appear before or after a subcommand

```bash
tool --global install --pkg cowsay
tool install --pkg cowsay --global
```

### 2. `--` stops option parsing

Everything after `--` is treated as an operand.

```bash
tool -- child --value x
```

In that case, `child --value x` is treated as raw operands.

### 3. Options may appear before, after, or between operands

Examples from `SEMANTICS.md`:

```bash
tool copy --recursive src dest
tool copy src dest --recursive
tool copy --recursive src dest --force
```

### 4. Boolean flags support both presence and negation

The semantics file documents:

- `--verbose` means true
- `--no-verbose` means false

Optional booleans distinguish omission from explicit false.

### 5. Built-in flags have global precedence

From `SEMANTICS.md`:

```bash
tool --version copy src dest
```

That prints the version and exits. The subcommand does not run.

### 6. Unknown commands and options produce suggestions

Examples from the semantics file:

```bash
tool cpy
tool --debugs copy ...
tool -u copy ...
```

The parser suggests similar subcommands or options.

## Help as control flow

`CliError.ShowHelp` is a control-flow error used to trigger help rendering.

The source sets the exit code like this:

- no parse errors: exit code `0`
- help shown with parse errors: exit code `1`

From `CliError.ts`:

```ts
override readonly [Runtime.errorExitCode] = this.errors.length ? 1 : 0
```

This means plain `--help` is treated as successful help output, not as a failure.

## Built-in global behavior inside `runWith`

The `runWith` implementation shows the execution order:

1. lex argv
2. collect known global flags across the command tree
3. extract active global flags
4. parse command arguments
5. run action flags like help or version first
6. render help on parse failures
7. provide setting flags like log level into the handler environment
8. run the command handler

That explains why `--version` and `--help` take precedence over normal command execution.

## Command metadata

`Command.ts` exposes metadata combinators that show up in help and completions:

- `Command.withDescription(...)`
- `Command.withShortDescription(...)`
- `Command.withAlias(...)`
- `Command.withExamples(...)`

Use them to make the generated CLI output readable without writing your own help system.

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/Command.ts`
- `.reference/effect/packages/effect/src/unstable/cli/CliError.ts`
- `.reference/effect/packages/effect/src/unstable/cli/GlobalFlag.ts`
- `.reference/effect/packages/effect/src/unstable/cli/SEMANTICS.md`
- `.reference/effect/packages/effect/test/unstable/cli/fixtures/ComprehensiveCli.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Command.test.ts`
