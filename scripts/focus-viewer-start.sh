#!/usr/bin/env bash
# focus-viewer-start.sh — idempotently ensure the omo-focus session viewer
# window exists. Designed to run at login (GNOME autostart); safe to re-run.
set -u

# PATH: the caller may be a systemd service or a bare env without snap or
# ~/.local/bin — both host alacritty and opencode on this machine.
for dir in /snap/bin "$HOME/.local/bin" "$HOME/.opencode/bin"; do
  case ":$PATH:" in *":$dir:"*) ;; *) PATH="$PATH:$dir" ;; esac
done
export PATH

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

CLASS="omoPulseFocus"
if wmctrl -x -l 2>/dev/null | grep -qi "$CLASS"; then
  exit 0
fi

# Own systemd scope when a session bus is reachable: the window survives a
# restart of whatever launched it (dashboard service, autostart, shell).
# Without a session bus (bare env), systemd-run fails silently — fall back to setsid.
if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -S "$XDG_RUNTIME_DIR/bus" ] && command -v systemd-run >/dev/null 2>&1; then
  systemd-run --user --scope --collect --unit="omo-focus-window-$$" \
    alacritty --class "$CLASS" --title omo-focus \
    -e "$SCRIPT_DIR/focus-viewer.sh" >/dev/null 2>&1 &
else
  setsid alacritty --class "$CLASS" --title omo-focus \
    -e "$SCRIPT_DIR/focus-viewer.sh" >/dev/null 2>&1 &
fi

# Confirm the window actually mapped; non-zero tells the caller we failed.
for _ in $(seq 1 20); do
  wmctrl -x -l 2>/dev/null | grep -qi "$CLASS" && exit 0
  sleep 0.25
done
echo "[focus-viewer-start] window did not appear" >&2
exit 1
