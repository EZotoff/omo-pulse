#!/usr/bin/env bash
# focus-viewer.sh — supervisor for the omo-focus viewer session.
#
# Owns three things:
#   1. the alacritty window (respawns it if closed — self-heal),
#   2. the zellij session "omo-focus" (one warm tab per viewed session),
#   3. the FIFO request loop.
#
# A request ("<project-dir>\t<session-id>[tprearm]") switches to the
# session's tab if it exists (instant — warm tabs keep receiving live
# daemon updates while in the background), or creates it via a generated
# tab layout. Tabs are LRU-capped: the oldest is evicted beyond MAX_TABS.
#
# Started by focus-viewer-start.sh; logs to viewer.log.
set -u

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/omo-pulse"
FIFO="$STATE_DIR/focus.fifo"
LOG="$STATE_DIR/viewer.log"
PIDFILE="$STATE_DIR/focus-supervisor.pid"
LRU="$STATE_DIR/focus.tabs"
CLASS="omoPulseFocus"
SESSION="omo-focus"
TAB_PREFIX="s-"
MAX_TABS=4
ATTACH_URL="http://127.0.0.1:3030"
ENV_FILE="$HOME/.config/opencode/serve-interactive.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# PATH: opencode/alacritty may live outside a service's default PATH.
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
# Zellij keeps session sockets under XDG_RUNTIME_DIR — pin it so the
# supervisor (systemd service) and shell-spawned windows share one universe.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export XAUTHORITY="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"

mkdir -p "$STATE_DIR"
[ -p "$FIFO" ] || mkfifo "$FIFO"
exec 8<>"$FIFO"

# Welcome layout: generated so the banner script path is absolute.
WELCOME_KDL="$STATE_DIR/focus-welcome.kdl"
cat > "$WELCOME_KDL" <<EOKDL
layout {
    tab name="welcome" {
        pane command="bash" cwd="$SCRIPT_DIR" {
            args "-c" "./focus-banner.sh"
        }
    }
}
EOKDL

LOGF="$STATE_DIR/viewer.log"
log() { echo "[$(date +%H:%M:%S)] $*" >> "$LOGF"; }

# ── single instance ──
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  log "supervisor already running ($(cat "$PIDFILE")) — exiting"
  exit 0
fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

log "supervisor started (pid $$)"

z() { zellij --session "$SESSION" "$@"; }

ensure_window() {
  wmctrl -x -l 2>/dev/null | grep -qi "$CLASS" && return 0
  log "window missing — spawning"
  # `zellij --session X` errors when X already exists (incl. dead records that
  # list-sessions hides) — attach resurrects in that case, so prefer it.
  local zcmd
  if zellij list-sessions 2>/dev/null | grep -q "$SESSION"; then
    zcmd="zellij attach '$SESSION'"
  else
    zcmd="zellij --session '$SESSION' -n '$WELCOME_KDL'"
  fi
  # The window must be born with a controlling terminal: snap alacritty
  # exits silently when launched without one (script(1) provides the pty).
  # A transient service detaches it from this supervisor and its callers.
  if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -S "$XDG_RUNTIME_DIR/bus" ] && command -v systemd-run >/dev/null 2>&1; then
    systemd-run --user --unit="omo-focus-window-$$" --collect \
      setsid script -qec "exec alacritty --class '$CLASS' --title omo-focus -e $zcmd" /dev/null \
      >>"$LOG" 2>&1
  else
    setsid script -qec "exec alacritty --class '$CLASS' --title omo-focus -e $zcmd" /dev/null \
      >>"$LOG" 2>&1 &
  fi
  for _ in $(seq 1 60); do
    wmctrl -x -l 2>/dev/null | grep -qi "$CLASS" && return 0
    sleep 0.5
  done
  log "window failed to appear"
  return 1
}
wait_session() {
  for _ in $(seq 1 60); do
    zellij list-sessions 2>/dev/null | grep -q "^$SESSION" && return 0
    sleep 0.5
  done
  log "zellij session never appeared"
  return 1
}

tab_names() { z action query-tab-names 2>/dev/null; }

tab_for() { # deterministic tab name per session id
  echo "${TAB_PREFIX}$(printf %s "$1" | cksum | cut -d' ' -f1)"
}

touch_lru() { # move tab to the end of the LRU stack
  grep -vx "$1" "$LRU" 2>/dev/null > "$LRU.tmp" || true
  echo "$1" >> "$LRU.tmp"
  mv "$LRU.tmp" "$LRU"
}

write_layout() { # per-request tab layout running the attach
  cat > "$STATE_DIR/focus-tab.kdl" <<EOKDL
layout {
    tab name="$2" focus=true {
        pane command="opencode" cwd="$1" close_on_exit=true {
            args "attach" "$ATTACH_URL" "--dir" "$1" "-s" "$2"
        }
    }
}
EOKDL
}

ensure_tab() { # $1=dir $2=sid $3=tab — create+evict if missing; not focused
  if tab_names | grep -qx "$3"; then
    return 0
  fi
  local names count oldest
  names=$(tab_names | grep "^$TAB_PREFIX" | grep -vx "$3" || true)
  count=$(printf '%s' "$names" | grep -c . || true)
  if [ "${count:-0}" -ge "$MAX_TABS" ]; then
    oldest=$(head -n1 "$LRU" 2>/dev/null)
    if [ -n "$oldest" ]; then
      log "evicting tab $oldest"
      z action go-to-tab-name "$oldest" >/dev/null 2>&1
      z action close-tab >/dev/null 2>&1
      grep -vx "$oldest" "$LRU" 2>/dev/null > "$LRU.tmp" || true
      mv "$LRU.tmp" "$LRU"
    fi
  fi
  write_layout "$1" "$3"
  z action new-tab --layout "$STATE_DIR/focus-tab.kdl" --name "$3" >/dev/null 2>&1
  log "tab $3 created dir=$1 sid=$2"
}

process_request() { # $1=dir $2=sid $3=prewarm("1"|"")

  local tab
  tab=$(tab_for "$2")
  ensure_tab "$1" "$2" "$tab"
  touch_lru "$tab"
  if [ "$3" = "1" ]; then
    log "prewarm sid=$2"
    return 0
  fi
  z action go-to-tab-name "$tab" >/dev/null 2>&1
  ensure_window || return 0
  wmctrl -a "omo-focus" 2>/dev/null || true
  log "focused tab=$tab dir=$1 sid=$2"
}

# Startup is best-effort: snap alacritty cold-starts slowly, so the main
# loop re-ensures window + session on every request instead of exiting.
ensure_window || true
wait_session || true

while :; do
  IFS=$'\t' read -r dir sid prewarm <&8 || dir=""
  [ -n "${dir:-}" ] && [ -n "${sid:-}" ] || continue
  ensure_window || continue
  wait_session || continue
  process_request "$dir" "$sid" "${prewarm:-}"
done
