# Ralph Setup

This folder contains a repo-local Ralph-style loop for OpenCode.

## Files

- `prd.json`: The scoped backlog Ralph works through.
- `progress.md`: Short context carried between iterations.
- `prompt.md`: The standing instructions for each loop.
- `ralph-once.sh`: Runs one HITL iteration.
- `afk-ralph.sh`: Runs a bounded AFK loop.
- `update-github-issues.ts`: Closes completed GitHub issues from the PRD.

## Quick Start

1. Edit `.ralph/prd.json` so each item has clear acceptance steps.
2. Review `.ralph/prompt.md` and adjust the quality bar if needed.
3. Run one supervised pass:

```bash
bun run ralph:once
```

4. When the prompt is behaving well, run a bounded AFK loop:

```bash
bun run ralph:afk -- 5
```

## Sync GitHub Issues

Generate `.ralph/prd.json` from GitHub issues:

```bash
bun run ralph:sync-issues
```

Optional filters:

```bash
RALPH_ISSUE_LABELS=ralph bun run ralph:sync-issues
RALPH_ISSUE_LABELS=ralph,blueprint RALPH_ISSUE_LIMIT=50 bun run ralph:sync-issues
RALPH_ISSUE_REPO=owner/repo bun run ralph:sync-issues
```

The sync script:

- reads open issues with `gh`
- pulls checklist items from `## Acceptance criteria` or `## Verify`
- falls back to `## What to build` or the issue title when needed
- preserves existing `passes` values for matching issue numbers

## Update GitHub During The Loop

When Ralph marks a PRD item complete and it has an `issueNumber`, the loop can update GitHub directly:

```bash
bun run ralph:github-update
```

The updater:

- reads completed items from `.ralph/prd.json`
- checks whether the GitHub issue is still open
- closes open issues with a short completion comment
- skips issues that are already closed

## Environment

- `RALPH_MODEL`: Optional model override for `opencode run`.
- `RALPH_AGENT`: Optional agent override.
- `RALPH_ISSUE_LABELS`: Optional comma-separated label filter for issue sync.
- `RALPH_ISSUE_LIMIT`: Optional issue sync limit. Defaults to `100`.
- `RALPH_ISSUE_REPO`: Optional `owner/repo` override for issue sync.
- `RALPH_ISSUE_STATE`: Optional issue state for sync. Defaults to `open`.
- `RALPH_ISSUE_UPDATE_DRY_RUN=1`: Preview issue closes without changing GitHub.
- `RALPH_SKIP_PERMISSIONS=1`: Adds `--dangerously-skip-permissions`.
  Use this only when you trust the prompt. Prefer a sandbox.
- `RALPH_USE_DOCKER_SANDBOX=1`: Wraps the run with `docker sandbox run`.

Examples:

```bash
RALPH_SKIP_PERMISSIONS=1 bun run ralph:once
RALPH_USE_DOCKER_SANDBOX=1 bun run ralph:afk -- 10
RALPH_MODEL=anthropic/claude-sonnet-4-5 bun run ralph:once
RALPH_ISSUE_LABELS=ralph bun run ralph:sync-issues
RALPH_ISSUE_UPDATE_DRY_RUN=1 bun run ralph:github-update
```

## Feedback Loops

The loop asks Ralph to use this repo's standard checks before each commit:

- `bun lint`
- `bun run type-check`
- `bun test`

Swap these in `.ralph/prompt.md` if you want narrower checks for a given sprint.

## Notes

- The loop is intentionally bounded. Pass an iteration count to AFK mode.
- `.ralph/logs/` stores raw run output and is git ignored.
- `progress.md` is kept in the repo on purpose so future iterations can read it.
