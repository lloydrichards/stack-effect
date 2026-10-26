import { Effect } from "effect";
import { McpServer } from "effect/ai";

export const PrimerResourceLive = McpServer.resource({
  uri: "stack-effect://primer",
  name: "Stack Effect Workshop Primer",
  description:
    "Project context and workshop quantities for the welcome briefing",
  mimeType: "text/plain",
  content: Effect.succeed(
    "Team: Stack Effect. Project: a full-stack TypeScript application built with Effect. Workshop plan: 6 groups, with 7 kits for each group. Use the calculator for the total; this resource supplies the facts, not the computed answer.",
  ),
});
