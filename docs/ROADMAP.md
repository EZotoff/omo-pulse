# omo-pulse Roadmap

Working notes for upcoming interaction work. Statuses: **in design** → **planned** → **shipped**.

## In design

### Session focus flow (dashboard click → terminal)

Recreates OC Beacon's "push message with a clickable link to the finished session" on the
desktop: clicking a session in the dashboard jumps a dedicated terminal window straight to
that session's TUI.

- `POST /focus/:sourceId/:sessionId` API endpoint (localhost-only) in `src/server/api.ts`
- **Session viewer window (always-on panel)**: one dedicated Alacritty window
  (`omo-focus`, WM_CLASS `omoPulseFocus`) launched at login via
  `~/.config/autostart/omo-focus-viewer.desktop` → `scripts/focus-viewer-start.sh`
  (idempotent; display auto-detected). Inside runs `scripts/focus-viewer.sh`: a FIFO
  request loop with a watchdog — each `POST /focus` swaps the attached TUI
  (`opencode attach … -s <sessionId>`) and raises the window via wmctrl.
  Key pitfalls handled: background jobs get stdin=/dev/null (pty fds are dup'd to
  fd3/4/5 and passed explicitly), FIFO write-open deadlock (O_RDWR fd8), and
  preemption while a TUI is foreground (watchdog kills the child via a pid file).
  Viewer diagnostics: `~/.local/state/omo-pulse/viewer.log`.
- Window raised via `wmctrl`/`xdotool` (GNOME X11); the window is NOT a child of the
  dashboard's systemd cgroup — it survives dashboard restarts.
  wrapper script — a FIFO request loop that SIGTERMs the current `opencode attach` and
  spawns the next (`oa <dir> -s <sessionId>`). No zellij involvement; content is replaced
  per click, real state lives on the port-3030 daemon.
- Window raised via `wmctrl`/`xdotool` (GNOME X11); first-click spawn detached from the
  dashboard's systemd cgroup (`systemd-run --user --scope`).
- Clickable session targets in the dashboard UI — two mock-ups under evaluation:
  `docs/mockups/focus/`
- **Expanded project view retired** (unused; frees vertical space for the new interactions).

## Planned

### Attention ranking (shared plumbing)

`GET /api/attention` — per project, the ranked "next session requiring my attention":

1. question pending
2. error / danger
3. finished, awaiting user input (idle)
4. plan complete
5. working (busy)

One endpoint serving every consumer of this concept: dashboard interactions, the focus
remote window, and the Stream Deck keys below.

### Stream Deck (Elgato, LCD keys) — hardware pending

- One LCD key per project; key lighting reuses the dashboard status language
  (busy cyan / attention amber / question purple / danger red / idle dim).
- LCD face shows the project's **next-attention session** label (from `/api/attention`).
- Key press → focus that session in the viewer window via the same `/focus` pipeline as
  dashboard clicks.
- Open question: behavior when the displayed session was already handled (auto-advance to
  the next in queue on second press vs. explicit cycle control).
- Queue depth: one key surfaces the top-ranked session only; how the rest of the queue is
  reached (second LCD page, long-press cycle) is open — the dashboard's B2 mock-up solves
  the same problem in UI space via per-session chips
  (`docs/mockups/focus/B2-inline-strips-v2.html`).

### OC Beacon desktop parity

Desktop notification actions (`notify-send`) reusing the same focus pipeline, so phone
pushes and desktop toasts land in the same viewer window.

### Related decisions (2026-09-18)

- Rejected: new-tab-per-click and in-place pane focusing inside the user's zellij layout
  (zellij 0.43 CLI has no focus-pane-by-id; accumulation clutter). The viewer lives
  outside zellij on purpose — project layout stays untouched.
- Alacritty has no remote-control surface; nothing to build there. Window management is
  WM-level (wmctrl/xdotool).
