#!/usr/bin/env bash
set -euo pipefail

# deploy-local.sh — Sync the local production install from committed HEAD.
#
# The ez-omo-dash systemd service runs from an installed copy at
# ~/.local/share/omo-pulse, NOT from a git working tree. This is deliberate:
# production must never ship uncommitted WIP from the repo (other agents may
# have changes in flight). This script exports committed HEAD, rebuilds the
# install, restarts the service, and verifies health.
#
# Usage: scripts/deploy-local.sh [target-dir]
#   target-dir defaults to ~/.local/share/omo-pulse

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$HOME/.local/share/omo-pulse}"
HEALTH_URL="http://127.0.0.1:4300/api/health"

if [[ ! -d "$TARGET" ]]; then
  echo "ERROR: target $TARGET does not exist. Install omo-pulse there first." >&2
  exit 1
fi

HEAD_SHA="$(git -C "$PROJECT_DIR" rev-parse HEAD)"
DIRTY="$(git -C "$PROJECT_DIR" status --porcelain | wc -l)"
echo "Deploying committed HEAD ${HEAD_SHA:0:7} -> $TARGET"
if [[ "$DIRTY" -gt 0 ]]; then
  echo "NOTE: working tree has $DIRTY uncommitted change(s) — they will NOT be deployed (by design)."
fi

# Export committed HEAD over the install. Only tracked files are replaced;
# node_modules and any local state in the target are left untouched.
git -C "$PROJECT_DIR" archive HEAD | tar -x -C "$TARGET"

echo "Installing dependencies..."
cd "$TARGET"
bun install --frozen-lockfile

echo "Building..."
bun run build

echo "Restarting service..."
systemctl --user restart ez-omo-dash.service
sleep 1

if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null; then
  echo "Deploy OK: ${HEAD_SHA:0:7} live, health check passed."
else
  echo "ERROR: health check failed after deploy (${HEALTH_URL})" >&2
  exit 1
fi
