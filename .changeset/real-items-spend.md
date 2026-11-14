---
"stack-effect": minor
"@stack-effect/author": minor
---

Generated projects now use Effect 4.1.4, Vitest 5, and updated application and build tooling, with migrated crypto, MCP, Foldkit, and Alchemy code.

TypeScript 7 projects with Oxlint now enable the strict Effect preset. Expected platform APIs use explicit allowlists; style suggestions stay visible as warnings. Bun projects use the hoisted linker for TypeScript declaration compatibility.

`@stack-effect/author` now requires Effect 4.1.4. Update the Effect runtime packages together when upgrading an existing author project.

Recipe Builder now treats None tooling selections as absent configuration when generating a preview.

Adding Foldkit RPC, presence, or chat modules now reports a dependency conflict before writing files when an existing target uses a different Foldkit version. Upgrade Foldkit and migrate existing subscriptions to the 0.170 API before adding these modules.

Generated AI chat now uses Effect's bounded `Chat.streamText` loop. Each tool call produces one start event, and a completed generation reports usage across all rounds when the provider supplies it. Clients receive a `max-iterations` finish after 12 consecutive tool rounds.

When adopting the new templates in an existing app, migrate custom `AgenticLoopService` callers to `AiChatService.chat` for catalog events or `session.streamText({ prompt: [], toolkit, maxSteps })` for native Effect parts. Guard a zero-step budget before calling Effect if your caller allows it. Remove the old service Layer, its barrel export and `workflow/AgenticLoop.ts` after migrating the last import. `stack-effect add` leaves obsolete files in place.
