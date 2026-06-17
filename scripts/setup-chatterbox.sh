#!/usr/bin/env bash
# One-time setup for the local Chatterbox TTS server.
#
# Creates the Python venv and installs the dependencies that
# scripts/chatterbox_tts_server.py imports, at the path the Studio server
# autostarts (see apps/studio/lib/runtime/studio-runtime-config.mjs:
# LVSTUDIO_CHATTERBOX_PYTHON / CHATTERBOX_MODEL_CACHE).
#
# Run once: `pnpm setup:chatterbox`. After that, `pnpm start` boots the
# server which launches Chatterbox on demand. The default venv lives under
# /private/tmp and is cleared on reboot — re-run this script after a reboot,
# or point LVSTUDIO_CHATTERBOX_VENV at a persistent path (and export the
# matching LVSTUDIO_CHATTERBOX_PYTHON for the Studio server).
set -euo pipefail

VENV_DIR="${LVSTUDIO_CHATTERBOX_VENV:-/private/tmp/lvstudio-chatterbox-venv}"
MODEL_CACHE="${CHATTERBOX_MODEL_CACHE:-/private/tmp/lvstudio-hf}"
PYTHON_BIN="${LVSTUDIO_SETUP_PYTHON:-python3.11}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "error: '$PYTHON_BIN' not found. Chatterbox requires Python 3.11." >&2
  echo "  Install it (e.g. 'brew install python@3.11') or set LVSTUDIO_SETUP_PYTHON." >&2
  exit 1
fi

PY_VERSION="$("$PYTHON_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [ "$PY_VERSION" != "3.11" ]; then
  echo "warning: '$PYTHON_BIN' is Python $PY_VERSION; Chatterbox is only known to work on 3.11." >&2
fi

echo "==> Creating venv at $VENV_DIR ($("$PYTHON_BIN" --version 2>&1))"
"$PYTHON_BIN" -m venv "$VENV_DIR"

PIP="$VENV_DIR/bin/pip"
echo "==> Upgrading pip"
"$PIP" install --upgrade pip

# chatterbox-tts pulls in torch/torchaudio and perth (the watermarker the
# server patches). fastapi/uvicorn/soundfile are the server's own deps.
echo "==> Installing Chatterbox + server dependencies (this downloads several GB)"
"$PIP" install chatterbox-tts soundfile fastapi uvicorn

mkdir -p "$MODEL_CACHE"

echo
echo "Done. venv: $VENV_DIR"
echo "Model weights download on first TTS request into: $MODEL_CACHE"
echo "Run the app with: pnpm start"
