# src/ingest/ — Data Ingestion Layer

Read-only data extraction from OpenCode's SQLite database and file-based storage.

## Overview

13 modules that derive dashboard data from OpenCode's native storage. Two backends: SQLite (primary, via `bun:sqlite`) and file-based (legacy fallback). Every read goes through `withReadonlyDb()` — never writes.

## Key Files

| File | Complexity | Role |
|------|-----------|------|
| `storage-backend.ts` | HIGH | Backend selection, `withReadonlyDb`, all SQLite read functions, `TodoItem` |
| `sqlite-derive.ts` | HIGH | Status derivation, message parsing, agent/tool/model extraction |
| `background-tasks.ts` | HIGH | Background task discovery from session tree + tool parts |
| `session.ts` | MED | Session metadata reading (file-based backend) |
| `timeseries.ts` | MED | Activity time-series bucketing for sparklines |
| `per-session-timeseries.ts` | MED | Per-session breakdown for swimlane chart |
| `token-usage.ts` | MED | Token aggregation across main + background sessions |
| `token-usage-core.ts` | LOW | Pure token counting from message metadata |
| `tool-calls.ts` | MED | Tool call extraction from SQLite message parts |
| `boulder.ts` | MED | `.sisyphus/` plan file parsing, step completion tracking |
| `sources-registry.ts` | LOW | JSON file CRUD for registered project sources |
| `model.ts` | LOW | Model name normalization (e.g., `claude-opus-4-20250514` → `opus`) |
| `paths.ts` | LOW | `realpath` resolution, XDG path helpers |

## Patterns

- **Result types**: All read functions return `{ ok: true; rows/value } | { ok: false; reason }` — caller must check `ok`
- **Discriminated union**: `StorageBackend = SqliteStorageBackend | FilesStorageBackend` with `kind` field
- **Error classification**: `classifySqliteError()` maps SQLite errors to `SqliteReadFailureReason` enum (`not_found | locked | corrupt | permission | unknown`)
- **Validation helpers**: `asString()`, `asFiniteNumber()`, `isRole()`, `isToolStatus()` — safe extraction from untyped SQLite rows

## Anti-Patterns

- NEVER write to OpenCode's SQLite — read-only observer
- NEVER import types from individual ingest modules — use `src/types.ts`
- NEVER open SQLite without `{ readonly: true }` — use `withReadonlyDb()`
- NEVER assume SQLite exists — always handle `FilesStorageBackend` fallback
