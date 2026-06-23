#!/usr/bin/env bash
# One-command local startup for Studio plus the local Chatterbox runtime.
#
# If the configured Chatterbox Python venv is missing, this runs the existing
# setup script first. Studio still owns the actual Chatterbox process startup.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
VENV_DIR="${LVSTUDIO_CHATTERBOX_VENV:-/private/tmp/lvstudio-chatterbox-venv}"
CHATTERBOX_PYTHON="${LVSTUDIO_CHATTERBOX_PYTHON:-$VENV_DIR/bin/python}"
DRY_RUN="${LVSTUDIO_START_FULL_DRY_RUN:-0}"

cd "$ROOT_DIR"

if [ ! -x "$CHATTERBOX_PYTHON" ]; then
  echo "==> Chatterbox Python not found at $CHATTERBOX_PYTHON"
  if [ "$DRY_RUN" = "1" ]; then
    echo "dry-run: pnpm -s setup:chatterbox"
  else
    pnpm -s setup:chatterbox
  fi
fi

if [ -z "${LVSTUDIO_CHATTERBOX_PYTHON:-}" ]; then
  export LVSTUDIO_CHATTERBOX_PYTHON="$CHATTERBOX_PYTHON"
fi

echo "==> Using Chatterbox Python: $LVSTUDIO_CHATTERBOX_PYTHON"
if [ "$DRY_RUN" = "1" ]; then
  echo "dry-run: pnpm -s start"
  exit 0
fi

exec pnpm -s start
