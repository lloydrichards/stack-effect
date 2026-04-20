# Effect CLI Getting Started

This guide is based on the local Effect reference checkout in `.reference/effect`.

In that checkout, the CLI API lives under `effect/unstable/cli`.

## Where the module lives

The current exports are under the unstable namespace:

```ts
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as Argument from "effect/unstable/cli/Argument"
```

You can also import from the barrel:

```ts
import { Argument, Command, Flag } from "effect/unstable/cli"
```

The reference repo uses both styles. The entrypoint examples use module subpaths.

## The basic flow

Effect CLI has a small core model:

1. Build a command with `Command.make(...)`.
2. Describe inputs with `Flag` and `Argument`.
3. Attach behavior with a handler.
4. Execute it with `Command.run(...)` or `Command.runWith(...)`.
5. Provide platform services.

## Smallest command

This shape comes directly from the `Command.make` examples in the source:

```ts
import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"

const greet = Command.make("greet", {
  name: Flag.string("name"),
  count: Flag.integer("count").pipe(Flag.withDefault(1))
}, (config) =>
  Effect.gen(function*() {
    for (let i = 0; i < config.count; i++) {
      yield* Console.log(`Hello, ${config.name}!`)
    }
  }))
```

That command accepts:

```bash
greet --name Alice
greet --name Alice --count 3
```

## Running a command

The reference repo has two main execution patterns.

### `Command.run(...)` for real entrypoints

From `.reference/effect/packages/tools/utils/src/bin.ts`:

```ts
#!/usr/bin/env node

import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"

const cli = Command.make("effect-utils")

const main = Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer)
)

Effect.runPromise(main)
```

From `.reference/effect/packages/tools/bundle/src/bin.ts`:

```ts
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Command from "effect/unstable/cli/Command"

const MainLayer = Layer.mergeAll(
  Fixtures.layer,
  Reporter.layer
).pipe(Layer.provideMerge(NodeServices.layer))

Command.run(cli, { version: PackageJson["version"] }).pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
```

Use this shape for your actual executable.

### `Command.runWith(...)` for tests or controlled invocation

From the source docs for `runWith`:

```ts
const runCommand = Command.runWith(greet, { version: "1.0.0" })

yield* runCommand(["--name", "Alice", "--count", "2"])
yield* runCommand(["--help"])
yield* runCommand(["--version"])
```

Use `runWith(...)` when you want to pass argv explicitly.

## Built-in global flags

`Command.run(...)` and `Command.runWith(...)` wire in built-in global flags:

- `--help`, `-h`
- `--version`
- `--completions`
- `--log-level`

These come from `GlobalFlag.ts` in the reference source.

## What help output looks like

The help tests show the generated structure clearly:

- `DESCRIPTION`
- `USAGE`
- `ARGUMENTS`
- `FLAGS`
- `GLOBAL FLAGS`
- `SUBCOMMANDS`
- `EXAMPLES`

You get these sections by defining descriptions, arguments, flags, subcommands, and examples on the command tree.

## One important caveat

In the local reference checkout, this module is still unstable.

Write docs and examples against `effect/unstable/cli`, not a stable import path.

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/index.ts`
- `.reference/effect/packages/effect/src/unstable/cli/Command.ts`
- `.reference/effect/packages/effect/src/unstable/cli/GlobalFlag.ts`
- `.reference/effect/packages/tools/utils/src/bin.ts`
- `.reference/effect/packages/tools/bundle/src/bin.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Help.test.ts`
