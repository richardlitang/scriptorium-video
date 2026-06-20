#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_ROOT="$(mktemp -d)"
trap 'rm -rf "$DEMO_ROOT"' EXIT

cd "$REPO_ROOT"
pnpm -s build

cd "$DEMO_ROOT"
CLI="$REPO_ROOT/packages/cli/dist/index.js"

echo "== Create an isolated project =="
node "$CLI" create portfolio-proof --mode short_story --platform portfolio_site

echo
echo "== Validate its canonical project contracts =="
node "$CLI" validate portfolio-proof

echo
echo "== Resolve the declared production policy =="
node "$CLI" resolve-config portfolio-proof

echo
echo "== Inspect the generated local project shape =="
find content/projects/portfolio-proof -type f | sort | sed "s#^#${DEMO_ROOT}/#<temporary>/#"

echo
echo "Demo complete. The temporary project was isolated from this checkout and will be removed."
