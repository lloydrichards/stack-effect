import { Schema } from "effect";

export const GreetingPromptArguments = Schema.Struct({
  name: Schema.NonEmptyString.annotate({
    description: "The name of the person to greet",
  }),
});
export type GreetingPromptArguments = Schema.Schema.Type<
  typeof GreetingPromptArguments
>;

export const BriefingPromptArguments = Schema.Struct(
  GreetingPromptArguments.fields,
);
export type BriefingPromptArguments = Schema.Schema.Type<
  typeof BriefingPromptArguments
>;
