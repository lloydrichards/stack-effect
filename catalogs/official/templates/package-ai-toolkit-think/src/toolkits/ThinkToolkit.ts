import { Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/ai";

const thinkTool = Tool.make("think", {
  description: "Share a brief progress note or plan with the user.",
  parameters: Schema.Struct({ thought: Schema.String }),
  success: Schema.String,
});

export const ThinkToolkit = Toolkit.make(thinkTool);

export const ThinkToolkitLive = ThinkToolkit.toLayer({
  think: ({ thought }) => Effect.succeed(thought),
});
