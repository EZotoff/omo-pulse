#!/usr/bin/env bash
# focus-viewer-start.sh — idempotently ensure the omo-focus session viewer
# window exists. Designed to run at login (GNOME autostart); safe to re-run.
set -u

# X display: prefer inherited DISPLAY when the socket exists, else first socket.
if [ -z "${DISPLAY:-}" ] || [ ! -S "/tmp/.X11-unix/X${DISPLAY#:}" ]; then
  for sock in /tmp/.X11-unix/X*; do
    [ -S "$sock" ] || continue
    DISPLAY=":${sock##*X}"
    break
  done
fi
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if wmctrl -x -l 2>/dev/null | grep -qi "$CLASS"; then
  exit 0
fi

setsid alacritty --class "$CLASS" --title omo-focus \
  -e "$SCRIPT_DIR/focus-viewer.sh" >/dev/null 2>&1 &
