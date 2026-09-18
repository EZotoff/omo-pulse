#!/usr/bin/env bash
# focus-session.sh — orchestrator for the omo-pulse session viewer window.
# Called by POST /api/focus/<sourceId>/<sessionId> (localhost-only).
#
# Usage: focus-session.sh <project-dir> <session-id>
#
# If the viewer window (WM_CLASS omoPulseFocus) is alive, queues the request on
# the focus FIFO — the viewer swaps the TUI in place. Otherwise spawns a new
# detached Alacritty window (own systemd scope, so a dashboard restart never
# kills the viewer) with the request as its initial session.
# Prints "queued" or "spawned" on stdout; exits non-zero on failure.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: focus-session.sh <project-dir> <session-id>" >&2
  exit 2
fi
DIR=$1
SID=$2

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/omo-pulse"
FIFO="$STATE_DIR/focus.fifo"
CLASS="omoPulseFocus"
export DISPLAY="${DISPLAY:-:0}"

mkdir -p "$STATE_DIR"
[ -p "$FIFO" ] || mkfifo "$FIFO"

window_alive() {
  wmctrl -x -l 2>/dev/null | grep -qi "$CLASS"
}

raise_window() {
  wmctrl -x -a "$CLASS" 2>/dev/null || true
}

if window_alive; then
  printf '%s\t%s\n' "$DIR" "$SID" > "$FIFO"
  echo queued
else
  VIEWER="$(cd "$(dirname "$0")" && pwd)/focus-viewer.sh"
  UNIT="omo-focus-viewer-$$"
  # Own scope: detaches the viewer from the dashboard service's cgroup.
  systemd-run --user --unit="$UNIT" --collect \
    alacritty --class "$CLASS" --title omo-focus -e "$VIEWER" "$DIR" "$SID" \
    >/dev/null 2>&1 || {
      echo "failed to launch alacritty viewer (systemd-run)" >&2
      exit 1
    }
  # Wait for the window to map so the raise below lands.
  for _ in $(seq 1 20); do
    window_alive && break
    sleep 0.25
  done
  echo spawned
fi

raise_window
