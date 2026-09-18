#!/usr/bin/env bash
# focus-viewer.sh — the always-on session viewer. Main process of the
# omo-focus Alacritty window, launched at login by focus-viewer-start.sh.
#
# Blocks reading the focus FIFO; each request ("<project-dir>\t<session-id>")
# terminates the currently attached TUI and attaches opencode to the
# requested session on the interactive daemon (:3030). Sessions live on the
# daemon, so swapping TUIs loses nothing.
set -u

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/omo-pulse"
FIFO="$STATE_DIR/focus.fifo"
ENV_FILE="$HOME/.config/opencode/serve-interactive.env"
DAEMON_URL="http://127.0.0.1:3030"
# PATH: opencode may live outside a service's default PATH (this box:
# ~/.local/bin/opencode).
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac
export DISPLAY="${DISPLAY:-:0}"

mkdir -p "$STATE_DIR"
[ -p "$FIFO" ] || mkfifo "$FIFO"

# Snapshot the pty fds FIRST. Background jobs in non-interactive shells get
# stdin from /dev/null (POSIX), which makes a TUI see instant EOF and exit —
# so every attach is explicitly wired to these saved pty fds instead.
exec 3<&0 4>&1 5>&2
if ! [ -t 3 ]; then
  echo "[focus-viewer] fd0 is not a tty — TUI will not render" >&2
fi

# Open the FIFO read+write: O_RDWR opens never block, whereas a write-only
# open waits for a reader (and vice versa) — the viewer is the only reader
# and would deadlock against itself before reaching the read loop.
exec 8<>"$FIFO"

LOG="$STATE_DIR/viewer.log"
PENDING="$STATE_DIR/focus.pending"
CHILD_FILE="$STATE_DIR/focus.child"
log() { echo "[$(date +%H:%M:%S)] $*" >> "$LOG"; }

CHILD=""
WATCHER=""

cleanup() {
  if [ -n "$CHILD" ]; then
    kill "$CHILD" 2>/dev/null
  fi
  if [ -n "$WATCHER" ]; then
    kill "$WATCHER" 2>/dev/null
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
  # Explicit pty fds: see the dup note at the top. Never rely on background
  # stdin defaults or /dev/tty resolving here.
  opencode attach http://127.0.0.1:3030 --dir "$dir" -s "$sid" <&3 >&4 2>&5 &
  CHILD=$!
  printf '%s' "$CHILD" > "$CHILD_FILE"
  wait "$CHILD"
  log "attach dir=$dir sid=$sid exit=$?"
  CHILD=""
  : > "$CHILD_FILE"
}

show_idle() {
  clear
  cat <<'BANNER'


    omo-pulse · focus viewer

    waiting for a focus request —
    click a session in the focus remote

BANNER
}

log "viewer started (pid $$)"
rm -f "$PENDING" "$CHILD_FILE"
show_idle

# Watchdog owns the FIFO. The main loop is blocked in `wait` while a TUI is
# attached, so requests must be picked up concurrently: record the request,
# then kill the current TUI so the main loop advances to it immediately.
(
  while :; do
    IFS=$'\t' read -r d s <&8 || d=""
    [ -n "${d:-}" ] && [ -n "${s:-}" ] || continue
    printf '%s\t%s' "$d" "$s" > "$PENDING"
    CPID=$(cat "$CHILD_FILE" 2>/dev/null)
    [ -n "$CPID" ] && kill "$CPID" 2>/dev/null
  done
) &
WATCHER=$!

cleanup() {
  [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null
  kill "$WATCHER" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Initial request from argv (e.g. manual testing); otherwise idle until FIFO.
if [ $# -ge 2 ]; then
  run_session "$1" "$2"
  show_idle
fi

while :; do
  if [ -s "$PENDING" ]; then
    dir=""; sid=""
    IFS=$'\t' read -r dir sid < "$PENDING" && rm -f "$PENDING"
    if [ -n "${dir:-}" ] && [ -n "${sid:-}" ]; then
      run_session "$dir" "$sid"
      show_idle
    fi
  else
    sleep 0.3
  fi
done
