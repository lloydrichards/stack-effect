import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Schema } from "effect";

export const StackConfigDefaults = Context.Reference<StackConfig>(
  "@repo/scaffold/StackConfigDefaults",
  {
    defaultValue: () =>
      new StackConfig({
        name: Schema.NonEmptyString.make("my-effect-app"),
        runtime: { _tag: "bun" },
        typescript: "7",
        monorepo: "vite-plus",
        lint: "oxlint",
        format: "oxfmt",
        test: "vitest",
      }),
  },
);
