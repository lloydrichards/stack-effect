import { Schema } from "effect";

export const GreetingPromptArguments = Schema.Struct({
  name: Schema.NonEmptyString.annotate({
    description: "The name of the person to greet",
  }),
});
export type GreetingPromptArguments = typeof GreetingPromptArguments.Type;

export const BriefingPromptArguments = Schema.Struct(
  GreetingPromptArguments.fields,
);
export type BriefingPromptArguments = typeof BriefingPromptArguments.Type;
