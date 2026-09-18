#!/usr/bin/env bash
# focus-session.sh — queue a session into the always-on omo-focus viewer
# window and raise it. Called by POST /api/focus/<sourceId>/<sessionId>.
#
# The window itself is created at login by focus-viewer-start.sh; this
# script only writes the request to the focus FIFO and focuses the window.
# Prints "queued" on stdout; exits non-zero when the viewer is not running.
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
# X display: prefer the inherited DISPLAY when its socket exists, else pick
# the first X socket (the session may have restarted and renumbered).
if [ -z "${DISPLAY:-}" ] || [ ! -S "/tmp/.X11-unix/X${DISPLAY#:}" ]; then
  for sock in /tmp/.X11-unix/X*; do
    [ -S "$sock" ] || continue
    DISPLAY=":${sock##*X}"
    break
  done
fi
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"

if ! wmctrl -x -l 2>/dev/null | grep -qi "$CLASS"; then
  echo "focus viewer window not running — start scripts/focus-viewer-start.sh" >&2
  exit 3
fi

if [ ! -p "$FIFO" ]; then
  echo "focus FIFO missing at $FIFO — viewer not initialized" >&2
  exit 3
fi

printf '%s\t%s\n' "$DIR" "$SID" > "$FIFO"
wmctrl -x -a "$CLASS" 2>/dev/null || true
echo queued
