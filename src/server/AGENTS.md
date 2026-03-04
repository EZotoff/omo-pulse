# src/server/ — API & Aggregation Layer

Hono HTTP server + multi-project dashboard assembly.

## Overview

5 modules: API routes, dashboard data builders (SQLite + file-based), multi-project aggregation service, dev/production entry points.

## Key Files

| File | Complexity | Role |
|------|-----------|------|
| `api.ts` | MED | `createApi()` factory — all REST routes, middleware, error handler |
| `dashboard.ts` | HIGH | `buildDashboardPayload()` (SQLite) + `buildDashboardPayloadFiles()` (files) + `createDashboardStore()` |
| `multi-project.ts` | MED | `createMultiProjectService()` — one `DashboardStore` per registered source |
| `dev.ts` | LOW | Dev entry: Bun.serve on `EZ_DASH_API_PORT` (4301) |
| `start.ts` | LOW | Prod entry: serves Vite-built SPA + API on `EZ_DASH_UI_PORT` (4300) |

## Data Flow

```
sources-registry.json
  → createMultiProjectService() scans all sources
    → createDashboardStore() per source (cached, polls at interval)
      → buildDashboardPayload() or buildDashboardPayloadFiles()
        → reads from src/ingest/* modules
          → transformPayloadToSnapshot() → ProjectSnapshot
            → GET /api/projects returns DashboardMultiProjectPayload
```

## Patterns

- **Factory**: `createApi({ storageRoot, storageBackend, pollIntervalMs })` → `Hono` instance
- **Middleware**: Global no-cache headers + JSON content type on all responses
- **Error shape**: `{ ok: false, error: string }` with HTTP status code
- **Caching**: `DashboardStore.getSnapshot()` returns cached result if within `pollIntervalMs`
- **Dual builder**: SQLite path (`buildDashboardPayload`) vs file path (`buildDashboardPayloadFiles`) — selected by `StorageBackend.kind`

## Anti-Patterns

- NEVER add routes outside `createApi()` factory
- NEVER import ingest modules directly in API routes — go through `dashboard.ts`
- NEVER assume SQLite — always check `StorageBackend.kind` first
