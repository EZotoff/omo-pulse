#!/usr/bin/env bash
# focus-remote-start.sh — open (or raise) the Focus Remote panel: a compact
# chrome-less Chrome app window showing GET /api/attention with FOCUS buttons.
# Pairs with the omo-focus viewer window; safe to re-run (raises if open).
set -u

# PATH for the browser binary.
for dir in /snap/bin "$HOME/.local/bin"; do
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

URL="http://127.0.0.1:4300/?view=remote"
TITLE="focus remote"   # matches document.title set by the remote view

# Already open anywhere? Just raise it.
if wmctrl -l 2>/dev/null | grep -qi "$TITLE"; then
  wmctrl -a "$TITLE" 2>/dev/null || true
  exit 0
fi

CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  command -v "$c" >/dev/null 2>&1 && { CHROME="$c"; break; }
done
if [ -z "$CHROME" ]; then
  echo "no chrome/chromium found — open $URL manually" >&2
  exit 1
fi

# --app = own chrome-less window; reuses a running Chrome instance if present.
exec "$CHROME" --app="$URL" --window-size=420,700 >/dev/null 2>&1
