#!/usr/bin/env bash
# One-command shutdown for everything start-full.sh brings up: the Studio
# server and the local Chatterbox runtime.
#
# Studio spawns Chatterbox detached (it outlives the Studio process), so
# stopping Studio alone leaves Chatterbox running. This stops both.
set -uo pipefail

DRY_RUN="${LVSTUDIO_STOP_FULL_DRY_RUN:-0}"
stopped=0

stop_pattern() {
  local label="$1" pattern="$2"
  local pids
  pids="$(pgrep -f "$pattern" || true)"
  if [ -z "$pids" ]; then
    echo "==> $label: not running"
    return
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "dry-run: kill $pids ($label)"
    stopped=1
    return
  fi
  echo "==> stopping $label ($(echo "$pids" | tr '\n' ' '))"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  stopped=1
}

stop_pattern "Studio server" "apps/studio/server.mjs"
stop_pattern "Chatterbox" "chatterbox_tts_server"

if [ "$stopped" = "0" ]; then
  echo "Nothing to stop."
fi
