import { Effect, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const thinkTool = Tool.make("think", {
  description: String.stripMargin(`
    |Use when facing ambiguous or multi-step problems where reasoning before
    |acting will improve accuracy. The thought is recorded but not shown to
    |the user.`),
  parameters: Schema.Struct({
    thought: Schema.String,
  }),
  success: Schema.String,
});

/**
 * Allows the model to reason through complex problems step-by-step.
 * Returns the thought as-is, enabling "thinking out loud" without
 * affecting the external state.
 *
 * @module
 */
export const ThinkToolkit = Toolkit.make(thinkTool);

export const ThinkToolkitLive = ThinkToolkit.toLayer(
  Effect.succeed({
    think: (params) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`Thinking: ${params.thought}`);
        return params.thought;
      }),
  }),
);
