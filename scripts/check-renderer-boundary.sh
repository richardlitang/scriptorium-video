#!/usr/bin/env bash
set -euo pipefail

if rg -n '@remotion' packages/core/src packages/cli/src >/tmp/lvstudio-remotion-core-cli.txt; then
  echo "Renderer boundary violation: @remotion import found in core/cli."
  cat /tmp/lvstudio-remotion-core-cli.txt
  exit 1
fi

if ! rg -n '@remotion' packages/providers/src/renderer/remotion >/tmp/lvstudio-remotion-provider.txt; then
  echo "Expected @remotion import in remotion provider, but none found."
  exit 1
fi

echo "Renderer boundary check passed."
