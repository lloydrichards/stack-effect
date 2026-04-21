You are running a Ralph-style autonomous implementation loop inside this repository.

Use `.ralph/prd.json` as the source of truth for scope.
Use `.ralph/progress.md` to understand what previous iterations already changed.
Consult `AGENTS.md` first, then any nested `AGENTS.md` files in areas you touch.

Execution rules:

1. Decide which single PRD item to work on next.
2. Prefer risky integration or architectural work before easy polish.
3. Make one logical change only. If the item is too large, complete one safe slice.
4. Do not touch unrelated files or revert user changes.
5. Run feedback loops before you commit:
   - `bun lint`
   - `bun run type-check`
   - `bun test`
6. If a check fails, fix the issue before committing.
7. After finishing the slice, update both files:
   - mark the PRD item or sub-step status clearly in `.ralph/prd.json`
   - append a short note to `.ralph/progress.md` with task, decisions, and files changed
8. If the completed PRD item has an `issueNumber` and `passes: true`, run `bun run ralph:github-update` so GitHub is updated during the same iteration.
9. Create one git commit for the completed slice.

Quality rules:

- Keep changes minimal and maintainable.
- Follow existing patterns in this monorepo.
- Do not add compatibility layers unless the codebase already needs them.
- Do not claim completion while any scoped item still fails its acceptance steps.

Stop condition:

- If every PRD item is complete and the repo feedback loops pass, output exactly `<promise>COMPLETE</promise>`.
