# Effect CLI Prompt Recipes

This file is a smaller cookbook for common Prompt patterns.

## Ask several questions at once

```ts
const answers = Prompt.all({
  projectName: Prompt.text({ message: "Project name" }),
  port: Prompt.integer({ message: "Port", min: 1, max: 65535 }),
  install: Prompt.confirm({ message: "Install dependencies?" })
})
```

## Ask a follow-up question based on the first answer

```ts
const flow = Prompt.select({
  message: "Target",
  choices: [
    { title: "Browser", value: "browser" },
    { title: "Node", value: "node" }
  ]
}).pipe(
  Prompt.flatMap((target) =>
    target === "browser"
      ? Prompt.all({
          target: Prompt.succeed(target),
          publicPath: Prompt.text({ message: "Public path", default: "/" })
        })
      : Prompt.all({
          target: Prompt.succeed(target),
          entry: Prompt.file({ message: "Entry file" })
        })
  )
)
```

## Build a searchable choice list

```ts
const template = Prompt.autoComplete({
  message: "Template",
  choices: [
    { title: "TypeScript CLI", value: "ts-cli" },
    { title: "TypeScript Library", value: "ts-lib" },
    { title: "React App", value: "react-app" }
  ]
})
```

## Let the user choose many features

```ts
const features = Prompt.multiSelect({
  message: "Features",
  choices: [
    { title: "Linting", value: "lint" },
    { title: "Formatting", value: "format" },
    { title: "Testing", value: "test", selected: true }
  ],
  min: 1
})
```

## Use prompts only when CLI args are missing

```ts
const nameFlag = Flag.string("name").pipe(
  Flag.withFallbackPrompt(Prompt.text({ message: "Name" }))
)

const fileArg = Argument.string("file").pipe(
  Argument.withFallbackPrompt(Prompt.text({ message: "File" }))
)
```

## Validate prompt input immediately

```ts
const projectName = Prompt.text({
  message: "Project name",
  validate: (value) =>
    value.trim().length === 0
      ? Effect.fail("Project name cannot be empty")
      : Effect.succeed(value)
})
```

## Keep an earlier answer in a later branch

```ts
const flow = Prompt.text({ message: "Project name" }).pipe(
  Prompt.flatMap((name) =>
    Prompt.all({
      name: Prompt.succeed(name),
      private: Prompt.confirm({ message: "Private package?" })
    })
  )
)
```

## Reference paths

- `.reference/effect/packages/effect/src/unstable/cli/Prompt.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Prompt.test.ts`
- `.reference/effect/packages/effect/test/unstable/cli/Param.test.ts`
