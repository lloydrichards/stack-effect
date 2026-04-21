#!/usr/bin/env bash

set -euo pipefail

if [ "${1:-}" = "" ]; then
  printf 'Usage: %s <iterations>\n' "$0" >&2
  exit 1
fi

if ! [[ "$1" =~ ^[0-9]+$ ]] || [ "$1" -lt 1 ]; then
  printf 'Iterations must be a positive integer.\n' >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for ((i = 1; i <= $1; i++)); do
  printf '\n[%s/%s] Starting Ralph iteration...\n' "$i" "$1"
  result="$(cd "$ROOT_DIR" && bash .ralph/ralph-once.sh)"
  printf '%s\n' "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    printf 'PRD complete, exiting early.\n'
    exit 0
  fi
done

printf 'Reached iteration limit without COMPLETE.\n'
