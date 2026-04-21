#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRD_FILE="${ROOT_DIR}/.ralph/prd.json"
PROGRESS_FILE="${ROOT_DIR}/.ralph/progress.md"
PROMPT_FILE="${ROOT_DIR}/.ralph/prompt.md"
LOG_DIR="${ROOT_DIR}/.ralph/logs"

if ! command -v opencode >/dev/null 2>&1; then
  printf 'opencode is required but was not found in PATH.\n' >&2
  exit 1
fi

for required_file in "$PRD_FILE" "$PROGRESS_FILE" "$PROMPT_FILE"; do
  if [ ! -f "$required_file" ]; then
    printf 'Missing required file: %s\n' "$required_file" >&2
    exit 1
  fi
done

mkdir -p "$LOG_DIR"

prompt_text="$(<"$PROMPT_FILE")"
timestamp="$(date +%Y%m%d-%H%M%S)"
log_file="${LOG_DIR}/once-${timestamp}.log"

command=(opencode)
if [ "${RALPH_USE_DOCKER_SANDBOX:-0}" = "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    printf 'docker is required for RALPH_USE_DOCKER_SANDBOX=1.\n' >&2
    exit 1
  fi
  command=(docker sandbox run opencode)
fi

args=(
  run
  --file "$ROOT_DIR/AGENTS.md"
  --file "$PRD_FILE"
  --file "$PROGRESS_FILE"
  --
  "$prompt_text"
)

if [ -n "${RALPH_MODEL:-}" ]; then
  args+=(--model "$RALPH_MODEL")
fi

if [ -n "${RALPH_AGENT:-}" ]; then
  args+=(--agent "$RALPH_AGENT")
fi

if [ "${RALPH_SKIP_PERMISSIONS:-0}" = "1" ]; then
  args+=(--dangerously-skip-permissions)
fi

printf 'Running one Ralph iteration...\n'
result="$(cd "$ROOT_DIR" && "${command[@]}" "${args[@]}")"
printf '%s\n' "$result" | tee "$log_file"

if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
  printf 'Scope complete.\n'
fi

printf 'Saved output to %s\n' "$log_file"
