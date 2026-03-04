#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BUN_PATH="$(which bun 2>/dev/null || true)"
if [[ -z "$BUN_PATH" ]]; then
  echo "ERROR: bun not found in PATH" >&2
  exit 1
fi

echo "Building project..."
cd "$PROJECT_DIR"
bun run build

SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

TEMPLATE="$PROJECT_DIR/systemd/ez-omo-dash.service"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: Service template not found at $TEMPLATE" >&2
  exit 1
fi

sed \
  -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
  -e "s|__BUN_PATH__|$BUN_PATH|g" \
  "$TEMPLATE" > "$SERVICE_DIR/ez-omo-dash.service"

systemctl --user daemon-reload
systemctl --user enable --now ez-omo-dash

echo ""
echo "Service installed and started successfully!"
echo ""
systemctl --user status ez-omo-dash
