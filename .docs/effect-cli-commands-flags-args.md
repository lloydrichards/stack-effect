# Effect CLI Commands, Flags, and Arguments

This guide focuses on the core building blocks used throughout the local Effect CLI sources and tests.

## Commands

`Command.make(...)` is the main constructor.

The source shows three common forms:

```ts
const version = Command.make("version")

const greet = Command.make("greet", {
  name: Flag.string("name"),
  count: Flag.integer("count").pipe(Flag.withDefault(1))
})

const deploy = Command.make("deploy", {
  environment: Flag.string("env"),
  force: Flag.boolean("force")
}, (config) =>
  Effect.gen(function*() {
    yield* Console.log(`Starting deployment to ${config.environment}`)
  }))
```

The second parameter is a config object. The handler receives the parsed and typed result of that object.

## Flags

The reference source provides these common flag constructors:

- `Flag.string(name)`
- `Flag.boolean(name)`
- `Flag.integer(name)`
- `Flag.float(name)`
- `Flag.date(name)`
- `Flag.choice(name, choices)`
- `Flag.choiceWithValue(name, choices)`
- `Flag.file(name, options)`
- `Flag.directory(name, options)`
- `Flag.path(name, options)`
- `Flag.redacted(name)`

### Example: defaults, aliases, descriptions

This pattern appears throughout `ComprehensiveCli.ts`:

```ts
const usersList = Command.make("list", {
  format: Flag.string("format").pipe(
    Flag.withDescription("Output format (json, table, csv)"),
    Flag.withDefault("table")
  ),
  active: Flag.boolean("active").pipe(
    Flag.withDescription("Show only active users")
  ),
  verbose: Flag.boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show detailed information")
  )
})
```

### Optional flags

`Flag.optional(...)` returns an `Option` value.

```ts
const configFile = Flag.string("config-file").pipe(
  Flag.optional
)
```

### Repeated flags

The reference API supports repeated flags with cardinality constraints:

- `Flag.atLeast(n)`
- `Flag.atMost(n)`
- `Flag.between(min, max)`

Example from the source docs:

```ts
const tagFlag = Flag.string("tag").pipe(
  Flag.atLeast(1)
)
```

### Transforming and validating flags

The flag API supports:

- `Flag.map(...)`
- `Flag.mapEffect(...)`
- `Flag.mapTryCatch(...)`
- `Flag.filter(...)`
- `Flag.filterMap(...)`
- `Flag.withSchema(...)`

Example from `Flag.ts`:

```ts
const portFlag = Flag.integer("port").pipe(
  Flag.filter(
    (port) => port >= 1 && port <= 65535,
    (port) => `Port ${port} is out of range (1-65535)`
  )
)
```

## Arguments

Arguments are positional inputs.

The reference source provides these common constructors:

- `Argument.string(name)`
- `Argument.integer(name)`
- `Argument.float(name)`
- `Argument.date(name)`
- `Argument.choice(name, choices)`
- `Argument.choiceWithValue(name, choices)`
- `Argument.file(name, options)`
- `Argument.directory(name, options)`
- `Argument.path(name, options)`
- `Argument.redacted(name)`

One explicit design choice from the source:

- there is no `Argument.boolean(...)`

The docs in `Argument.ts` explain why: positional booleans are ambiguous. Use `Flag.boolean(...)` instead.

### Example: required and optional positional args

From `ComprehensiveCli.ts`:

```ts
const usersCreate = Command.make("create", {
  username: Argument.string("username").pipe(
    Argument.withDescription("Username for the new user")
  ),
  email: Argument.string("email").pipe(
    Argument.withDescription("Email address (optional)"),
    Argument.optional
  ),
  role: Flag.string("role"),
  notify: Flag.boolean("notify")
})
```

The help test shows that this renders as:

```text
USAGE
  mycli admin users create [flags] <username> [<email>]
```

### Variadic arguments

The reference source supports variadic arguments directly.

```ts
const files = Argument.string("files").pipe(
  Argument.variadic({ min: 1 })
)
```

This renders in help as:

```text
<files...>
```

The API also includes:

- `Argument.atLeast(n)`
- `Argument.atMost(n)`
- `Argument.between(min, max)`

### Transforming and validating arguments

Arguments have the same broad shape as flags:

- `Argument.map(...)`
- `Argument.mapEffect(...)`
- `Argument.mapTryCatch(...)`
- `Argument.withSchema(...)`
- `Argument.withDefault(...)`

Example from `Argument.ts`:

```ts
const input = Argument.string("input").pipe(
  Argument.withSchema(Schema.NonEmptyString)
)
```

## Nested config objects

`Command.make(...)` accepts nested config objects, not just flat ones.

From `ComprehensiveCli.ts`:

```ts
const deployCommand = Command.make("deploy", {
  service: Argument.string("service"),
  environment: Argument.string("environment"),
  database: {
    host: Flag.string("db-host"),
    port: Flag.integer("db-port")
  },
  dryRun: Flag.boolean("dry-run")
})
```

That produces a nested value in the handler:

```ts
config.database.host
config.database.port
```

## File-oriented inputs

Both `Flag` and `Argument` support file-aware inputs:

- `file(...)`
- `directory(...)`
- `path(...)`
- `fileText(...)`
- `fileParse(...)`
- `fileSchema(...)`

These let the CLI parse a path, read a file, or decode file contents as part of argument parsing.

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/Command.ts`
- `.reference/effect/packages/effect/src/unstable/cli/Flag.ts`
- `.reference/effect/packages/effect/src/unstable/cli/Argument.ts`
- `.reference/effect/packages/effect/test/unstable/cli/fixtures/ComprehensiveCli.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Help.test.ts`
