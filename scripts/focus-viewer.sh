#!/usr/bin/env bash
# focus-viewer.sh — the session viewer loop. Runs INSIDE the dedicated
# omo-focus Alacritty window (spawned by focus-session.sh).
#
# Each request ("<project-dir>\t<session-id>" on the focus FIFO, or the
# initial argv) terminates the currently attached TUI and attaches
# opencode to the requested session on the interactive daemon (:3030) —
# sessions live on the daemon, so swapping TUIs loses nothing.
set -u

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/omo-pulse"
FIFO="$STATE_DIR/focus.fifo"
ENV_FILE="$HOME/.config/opencode/serve-interactive.env"
DAEMON_URL="http://127.0.0.1:3030"
export DISPLAY="${DISPLAY:-:0}"

mkdir -p "$STATE_DIR"
[ -p "$FIFO" ] || mkfifo "$FIFO"

# Hold a writer open so the reader never sees EOF between requests.
exec 9>>"$FIFO"

CHILD=""

cleanup() {
  if [ -n "$CHILD" ]; then
    kill "$CHILD" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

ensure_daemon() {
  if curl -s -o /dev/null --max-time 1 "$DAEMON_URL"; then
    return 0
  fi
  systemctl --user start opencode-interactive.service 2>/dev/null || true
  for _ in $(seq 1 20); do
    curl -s -o /dev/null --max-time 1 "$DAEMON_URL" && return 0
    sleep 0.5
  done
  return 1
}

run_session() {
  local dir=$1 sid=$2
  if [ -n "$CHILD" ]; then
    kill "$CHILD" 2>/dev/null
    wait "$CHILD" 2>/dev/null
    CHILD=""
  fi
  clear
  # Same credentials the `oa` shell function exports for the interactive daemon.
  set -a
  # shellcheck disable=SC1090
  [ -r "$ENV_FILE" ] && source "$ENV_FILE"
  set +a
  if ! ensure_daemon; then
    echo "[focus-viewer] daemon not reachable on $DAEMON_URL — retrying next request"
    sleep 2
    return 0
  fi
  opencode attach http://127.0.0.1:3030 --dir "$dir" -s "$sid" &
  CHILD=$!
  wait "$CHILD"
  CHILD=""
}

# Initial request from argv (first click spawns the window with its session).
if [ $# -ge 2 ]; then
  run_session "$1" "$2"
fi

# Subsequent requests arrive on the FIFO; read blocks until the next one.
while :; do
  IFS=$'\t' read -r dir sid < "$FIFO" || true
  [ -n "${dir:-}" ] && [ -n "${sid:-}" ] || continue
  run_session "$dir" "$sid"
done
