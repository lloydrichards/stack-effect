---
"stack-effect": minor
---

Generated chat uses Effect Chat to run up to 12 model rounds. CLI and RPC callers receive one start per tool call, summed usage when every round reports it, and a `max-iterations` finish at the limit. Stopping consumption of the generated app's stream now releases the active generation.

In existing apps, replace `AgenticLoopService` and `ChatTurnExtension` callbacks with an explicit prompt. Use `ai.stream({ prompt, toolkit })` for catalog events or `session.streamText({ prompt, toolkit, maxSteps })` for native Effect parts. The toolkit is optional for `ai.stream`. Existing queue consumers can use `ai.chat(prompt, toolkit)`. Handle a zero-step budget before calling Effect if your code accepts one.

Update your driver or runtime before adding MCP modules. Once callers have migrated, remove the old Layer, both workflow files (`AgenticLoop.ts` and `ChatTurnExtensions.ts`), and their barrel exports. `stack-effect add` leaves obsolete files in place.
