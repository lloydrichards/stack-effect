import { BriefingPromptArguments } from "@repo/domain/McpServerPrompt";
import { Effect } from "effect";
import { McpServer } from "effect/ai";

export const BriefingPromptLive = McpServer.prompt({
  name: "briefing",
  description:
    "Use the server primer and calculator to prepare a short welcome briefing",
  parameters: BriefingPromptArguments.fields,
  content: ({ name }) =>
    Effect.succeed(
      `Prepare a short welcome briefing for ${name}. Use the supplied stack-effect://primer resource to identify the team, its project, and the workshop quantities. Use the remote calculate tool to compute the total number of workshop kits from those quantities. Include the result in your briefing. If the primer or calculator is unavailable, explain what is missing instead of guessing.`,
    ),
});
