#!/usr/bin/env bash
# Deploy omo-pulse to the live systemd service.
#
# Why this exists: the live service runs from a dedicated install directory
# (not the dev repo), so code changes only reach it when that copy is updated.
# This script makes that a one-command (or automatic, via the post-merge git
# hook) operation: build in the repo, sync to the install dir, install runtime
# deps, restart, and verify the service actually came back healthy — including
# a probe of the realtime SSE endpoint.
#
# Override targets via env:
#   OMO_PULSE_INSTALL_DIR  (default ~/.local/share/omo-pulse)
#   OMO_PULSE_SERVICE      (default ez-omo-dash.service)
#   OMO_PULSE_PORT         (default 4300, used only for the health probe)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${OMO_PULSE_INSTALL_DIR:-$HOME/.local/share/omo-pulse}"
SERVICE_NAME="${OMO_PULSE_SERVICE:-ez-omo-dash.service}"
PORT="${OMO_PULSE_PORT:-4300}"

log() { printf '[deploy] %s\n' "$*"; }

cd "$REPO_DIR"

log "running tests before deploying"
bun run test >/dev/null

log "building UI bundle"
bun run build >/dev/null

log "syncing repo -> $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.omo' \
  --exclude '.opencode' \
  --exclude '.sisyphus' \
  --exclude '.vera' \
  --exclude '.codegraph' \
  --exclude 'test-badge*.ts' \
  --exclude 'tmp-*.mjs' \
  ./ "$INSTALL_DIR/"

log "installing runtime dependencies in install dir"
(cd "$INSTALL_DIR" && bun install --production --frozen-lockfile >/dev/null)

log "restarting $SERVICE_NAME"
systemctl --user restart "$SERVICE_NAME"
sleep 2

log "health check"
if ! curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "[deploy] FAILED: /api/health did not respond after restart" >&2
  journalctl --user -u "$SERVICE_NAME" -n 20 --no-pager >&2 || true
  exit 1
fi

log "realtime endpoint check (first SSE frame)"
SSE_PROBE="$(timeout 4 curl -sN "http://127.0.0.1:$PORT/api/events" | head -c 80 || true)"
if [[ "$SSE_PROBE" != *"event: status"* ]]; then
  echo "[deploy] WARNING: /api/events did not emit a status frame promptly: $SSE_PROBE" >&2
fi

log "done: live service is healthy on :$PORT"
