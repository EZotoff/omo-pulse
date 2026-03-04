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

# Escape sed special characters (&, \, |) in replacement strings
escape_sed() { printf '%s\n' "$1" | sed 's/[&\\|]/\\&/g'; }
SAFE_PROJECT_DIR=$(escape_sed "$PROJECT_DIR")
SAFE_BUN_PATH=$(escape_sed "$BUN_PATH")

sed \
  -e "s|__PROJECT_DIR__|${SAFE_PROJECT_DIR}|g" \
  -e "s|__BUN_PATH__|${SAFE_BUN_PATH}|g" \
  "$TEMPLATE" > "$SERVICE_DIR/ez-omo-dash.service"

systemctl --user daemon-reload
systemctl --user enable --now ez-omo-dash

echo ""
echo "Service installed and started successfully!"
echo ""
systemctl --user status ez-omo-dash
