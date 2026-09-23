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
export DISPLAY="${DISPLAY:-:0}"
# Zellij pins session sockets to XDG_RUNTIME_DIR — keep it explicit.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

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
log() { echo "[$(date +%H:%M:%S)] $*" >> "$LOG"; }

CHILD=""

cleanup() {
  [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null
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
  # (returns 0 = go idle; only preemption returns 1)
  # Explicit pty fds: background jobs get stdin from /dev/null (POSIX), which
  # makes the TUI see instant EOF and exit — wire the saved pty fds instead.
  opencode attach http://127.0.0.1:3030 --dir "$dir" -s "$sid" <&3 >&4 2>&5 &
  CHILD=$!
  # Interruptible wait: while the TUI runs, keep polling the FIFO — a new
  # request preempts (returns 1 so the caller re-runs with the pending pair).
  while kill -0 "$CHILD" 2>/dev/null; do
    if IFS=$'\t' read -t 0.5 -r pdir psid ppw <&8; then
      if [ -n "${pdir:-}" ] && [ -n "${psid:-}" ]; then
        PENDING_DIR="$pdir"; PENDING_SID="$psid"
        log "preempt dir=$dir sid=$sid"
        return 1
      fi
    fi
  done
  wait "$CHILD"
  log "attach dir=$dir sid=$sid exit=$?"
  CHILD=""
  return 0
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
show_idle

if [ $# -ge 2 ]; then
  run_session "$1" "$2"
  show_idle
fi

# Single-consumer poll: `read -t` on the FIFO doubles as the sleep between
# idle polls AND the preemption check while a TUI is attached. No subshell,
# no pending file — nothing to race or lose.
PENDING_DIR=""; PENDING_SID=""
while :; do
  if ! IFS=$'\t' read -t 0.5 -r dir sid prewarm <&8; then
    continue
  fi
  [ -n "${dir:-}" ] && [ -n "${sid:-}" ] || continue
  # run_session returns 1 when preempted — service the chain immediately.
  until run_session "$dir" "$sid"; do
    dir="$PENDING_DIR"; sid="$PENDING_SID"
    PENDING_DIR=""; PENDING_SID=""
    [ -n "$dir" ] && [ -n "$sid" ] || break
  done
  show_idle
done
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
