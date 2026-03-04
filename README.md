# omo-pulse

**Real-time dashboard for monitoring OpenCode AI coding sessions across all your projects.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/Runtime-Bun-%23f9f1e1?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)

![Dashboard — expanded panes showing plan progress, background tasks, and token usage](docs/screenshots/expanded_panes.png)

## What is omo-pulse?

omo-pulse monitors multiple [OpenCode](https://github.com/sst/opencode) projects in real-time, showing session activity, agent status, tool usage, plan progress, and token consumption across all your AI coding sessions in a single dashboard. It reads directly from OpenCode's SQLite database — no configuration or instrumentation required.

Run it as a persistent service alongside your development workflow and always know what your AI agents are doing.

## Features

### Functionality — What You Can Monitor

- **Multi-project dashboard** — watch all OpenCode projects from a single view
- **Real-time polling** — auto-refreshing every ~2s with connection health indicator
- **Plan progress** — step-by-step plan completion tracking with live status
- **Background tasks** — active agents, models (Claude, GPT, Kimi), and running tools
- **Token consumption** — input / output / total token usage per project
- **Session swimlane** — per-session activity timeline across all projects
- **Activity sparklines** — time-series charts for quick pattern recognition
- **Sound notifications** — audio alerts for idle, plan complete, errors, and questions
- **Zero instrumentation** — reads OpenCode's native SQLite database directly
- **Systemd service** — persistent background service with auto-start on login

### Interface — How You Monitor It

- **Multi-column layouts** — 1, 2, or 3-column grid to match your screen
- **Collapsible panes** — expand for full session details or collapse for quick status
- **Density modes** — comfortable, compact, and ultra-compact display options
- **Drag-and-drop ordering** — organize projects in your preferred order
- **Zoom controls** — scale the entire UI from 50% to 200%
- **Status-aware borders** — cyan glow (active), orange (needs attention), gray (idle)
- **Per-project visibility** — show/hide individual projects from settings
- **Resizable columns** — drag handles to adjust column widths
- **Dark mode** — optimized for extended coding sessions

<table>
  <tr>
    <td><img src="docs/screenshots/1col_wide.png" alt="Single column — full detail view" width="270"/></td>
    <td><img src="docs/screenshots/2col_compact.png" alt="Two-column compact grid" width="270"/></td>
    <td><img src="docs/screenshots/3col_ultra_compact.png" alt="Three-column ultra-compact view" width="270"/></td>
  </tr>
  <tr>
    <td align="center"><em>Full detail</em></td>
    <td align="center"><em>Compact grid</em></td>
    <td align="center"><em>Ultra-compact</em></td>
  </tr>
</table>

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) >= 1.1.0

```bash
git clone https://github.com/ezotoff/omo-pulse.git
cd omo-pulse
bun install
bun run dev
```

Open **http://localhost:4300** in your browser.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `EZ_DASH_UI_PORT` | `4300` | Vite dev server / production UI port |
| `EZ_DASH_API_PORT` | `4301` | API server port (dev mode) |
| `XDG_DATA_HOME` | `~/.local/share` | Base data directory for locating OpenCode storage |

In development, the UI runs on port 4300 and proxies `/api` requests to the API server on port 4301. In production (`bun run start`), both are served from a single port (4300).

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│          React SPA (Vite + React 18)         │
│  ┌─────────┬──────────┬──────────────────┐   │
│  │ Project │ Sparkline│  Plan Progress   │   │
│  │ Strips  │ Charts   │  Session Swimlane│   │
│  └─────────┴──────────┴──────────────────┘   │
│              polling (~2s)                    │
└──────────────────┬──────────────────────────┘
                   │ GET /api/projects
┌──────────────────▼──────────────────────────┐
│            Hono API Server (Bun)             │
│  ┌──────────────────────────────────────┐    │
│  │  Multi-Project Service               │    │
│  │  ├─ per-source DashboardStore        │    │
│  │  ├─ session status derivation        │    │
│  │  ├─ plan progress (boulder/steps)    │    │
│  │  └─ time-series aggregation          │    │
│  └──────────────────────────────────────┘    │
│              reads from                      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   OpenCode SQLite DB (~/.local/share/        │
│     opencode/opencode.db)                    │
│   ─────────────────────────────              │
│   Fallback: file-based storage               │
│     (~/.local/share/opencode/storage/)       │
└──────────────────────────────────────────────┘
```

**Tech stack:** [Hono](https://hono.dev) (HTTP server) · [React 18](https://react.dev) (UI) · [Vite](https://vitejs.dev) (build) · [Bun SQLite](https://bun.sh/docs/api/sqlite) (data) · [@dnd-kit](https://dndkit.com) (drag-and-drop)

## Project Structure

```
src/
├── server/          # Hono API server
│   ├── api.ts       # REST endpoints (/health, /projects, /sources, /tool-calls)
│   ├── dashboard.ts # Per-project data derivation from OpenCode storage
│   ├── multi-project.ts  # Multi-project aggregation service
│   ├── dev.ts       # Development server entry
│   └── start.ts     # Production server with SPA serving
├── ingest/          # Data ingestion and derivation
│   ├── storage-backend.ts  # SQLite / file-based backend selection
│   ├── session.ts          # Session metadata parsing
│   ├── boulder.ts          # Plan progress extraction
│   ├── timeseries.ts       # Activity time-series aggregation
│   ├── token-usage.ts      # Token consumption tracking
│   ├── tool-calls.ts       # Tool call derivation
│   └── background-tasks.ts # Background task tracking
├── ui/              # React SPA
│   ├── App.tsx      # Main dashboard layout with DnD
│   ├── components/  # ProjectStrip, Sparkline, PlanProgress, SessionSwimlane, etc.
│   └── hooks/       # useDashboardData, useProjectOrder, useSoundNotifications, etc.
└── types.ts         # Shared TypeScript types
```

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start both dev servers (UI + API) |
| `bun run dev:ui` | Vite dev server only |
| `bun run dev:api` | API dev server only |
| `bun run build` | Production build |
| `bun run start` | Production server |
| `bun run test` | Run tests (Vitest) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and contribution guidelines.

## License

[MIT](LICENSE) — Copyright 2025 EZotoff
