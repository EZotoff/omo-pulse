#!/usr/bin/env bash
set -euo pipefail

systemctl --user stop ez-omo-dash 2>/dev/null || true
systemctl --user disable ez-omo-dash 2>/dev/null || true

SERVICE_FILE="$HOME/.config/systemd/user/ez-omo-dash.service"
if [[ -f "$SERVICE_FILE" ]]; then
  rm "$SERVICE_FILE"
fi

systemctl --user daemon-reload

echo "Service uninstalled successfully."
