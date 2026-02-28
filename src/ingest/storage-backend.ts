import * as fs from "node:fs"
import * as path from "node:path"
import { Database as BunDatabase } from "bun:sqlite"
import type { SessionMetadata, StoredMessageMeta, StoredToolPart } from "./session"
import { realpathSafe } from "./paths"
import { getDataDir, getOpenCodeStorageDirFromDataDir, type Env } from "./paths"

const REQUIRED_TABLES = ["session", "message", "part"] as const

export type FilesStorageBackend = {
  kind: "files"
  dataDir: string
  storageRoot: string
}

export type SqliteStorageBackend = {
  kind: "sqlite"
  dataDir: string
  sqlitePath: string
}

export type StorageBackend = FilesStorageBackend | SqliteStorageBackend

export type SqliteReadFailureReason = "db_busy" | "db_corrupt" | "db_unopenable" | "db_query_failed"

export type SqliteReadResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; reason: SqliteReadFailureReason }

export function getOpenCodeSqlitePath(dataDir: string): string {
  return path.join(dataDir, "opencode", "opencode.db")
}

function classifySqliteError(error: unknown): SqliteReadFailureReason {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("database is locked") || message.includes("busy")) return "db_busy"
  if (
    message.includes("database disk image is malformed") ||
    message.includes("not a database") ||
    message.includes("corrupt")
  ) {
    return "db_corrupt"
  }
  if (message.includes("unable to open database file") || message.includes("cannot open")) {
    return "db_unopenable"
  }
  return "db_query_failed"
}

function withReadonlyDb<T>(sqlitePath: string, fn: (db: BunDatabase) => T): { ok: true; value: T } | { ok: false; reason: SqliteReadFailureReason } {
  let db: BunDatabase | null = null
  try {
    db = new BunDatabase(sqlitePath, { readonly: true })
    return { ok: true, value: fn(db) }
  } catch (error) {
    return { ok: false, reason: classifySqliteError(error) }
  } finally {
    try {
      db?.close()
    } catch {
    }
  }
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null
  return Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function isRole(value: unknown): value is StoredMessageMeta["role"] {
  return value === "user" || value === "assistant"
}

function isToolStatus(value: unknown): value is StoredToolPart["state"]["status"] {
  return value === "pending" || value === "running" || value === "completed" || value === "error"
}

export function readMainSessionMetasSqlite(opts: {
  sqlitePath: string
  directoryFilter?: string
}): SqliteReadResult<SessionMetadata> {
  const directoryNeedle = typeof opts.directoryFilter === "string" && opts.directoryFilter.length > 0
    ? (() => {
        const abs = path.resolve(opts.directoryFilter)
        const real = realpathSafe(abs) ?? abs
        return path.normalize(real)
      })()
    : null

  const result = withReadonlyDb(opts.sqlitePath, (db) =>
    db
      .query("SELECT id, project_id, parent_id, directory, title, time_created, time_updated FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC, id DESC")
      .all() as Array<{
      id: unknown
      project_id: unknown
      parent_id: unknown
      directory: unknown
      title: unknown
      time_created: unknown
      time_updated: unknown
    }>
  )
  if (!result.ok) return result

  const rows: SessionMetadata[] = []
  for (const row of result.value) {
    const id = asString(row.id)
    const projectID = asString(row.project_id)
    const directory = asString(row.directory)
    if (!id || !projectID || !directory) continue

    if (directoryNeedle) {
      const abs = path.resolve(directory)
      const real = realpathSafe(abs) ?? abs
      if (path.normalize(real) !== directoryNeedle) continue
    }

    const created = asFiniteNumber(row.time_created) ?? 0
    const updated = asFiniteNumber(row.time_updated) ?? created
    const title = asString(row.title)
    const parentID = asString(row.parent_id)
    rows.push({
      id,
      projectID,
      directory,
      ...(title ? { title } : {}),
      ...(parentID ? { parentID } : {}),
      time: {
        created,
        updated,
      },
    })
  }

  return { ok: true, rows }
}

export function readAllSessionMetasSqlite(opts: {
  sqlitePath: string
}): SqliteReadResult<SessionMetadata> {
  const result = withReadonlyDb(opts.sqlitePath, (db) =>
    db
      .query("SELECT id, project_id, parent_id, directory, title, time_created, time_updated FROM session ORDER BY time_updated DESC, id DESC")
      .all() as Array<{
      id: unknown
      project_id: unknown
      parent_id: unknown
      directory: unknown
      title: unknown
      time_created: unknown
      time_updated: unknown
    }>
  )
  if (!result.ok) return result

  const rows: SessionMetadata[] = []
  for (const row of result.value) {
    const id = asString(row.id)
    const projectID = asString(row.project_id)
    const directory = asString(row.directory)
    if (!id || !projectID || !directory) continue

    const created = asFiniteNumber(row.time_created) ?? 0
    const updated = asFiniteNumber(row.time_updated) ?? created
    const title = asString(row.title)
    const parentID = asString(row.parent_id)
    rows.push({
      id,
      projectID,
      directory,
      ...(title ? { title } : {}),
      ...(parentID ? { parentID } : {}),
      time: {
        created,
        updated,
      },
    })
  }

  return { ok: true, rows }
}

export function readSessionExistsSqlite(opts: {
  sqlitePath: string
  sessionId: string
}): SqliteReadResult<{ sessionId: string }> {
  const result = withReadonlyDb(opts.sqlitePath, (db) =>
    db
      .query("SELECT id FROM session WHERE id = ? LIMIT 1")
      .get(opts.sessionId) as { id?: unknown } | null
  )
  if (!result.ok) return result

  const id = asString(result.value?.id)
  if (!id) return { ok: true, rows: [] }
  return { ok: true, rows: [{ sessionId: id }] }
}

export function readRecentMessageMetasSqlite(opts: {
  sqlitePath: string
  sessionId: string
  limit: number
}): SqliteReadResult<StoredMessageMeta> {
  const result = withReadonlyDb(opts.sqlitePath, (db) =>
    db
      .query("SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created DESC, id DESC LIMIT ?")
      .all(opts.sessionId, opts.limit) as Array<{
      id: unknown
      session_id: unknown
      time_created: unknown
      data: unknown
    }>
  )
  if (!result.ok) return result

  const rows: Array<(StoredMessageMeta & Record<string, unknown>) & { _createdSortKey: number }> = []
  for (const row of result.value) {
    const id = asString(row.id)
    const sessionID = asString(row.session_id)
    const data = asString(row.data)
    if (!id || !sessionID || !data) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== "object") continue

    const rec = parsed as Record<string, unknown>
    if (!isRole(rec.role)) continue

    const time = rec.time && typeof rec.time === "object"
      ? (rec.time as Record<string, unknown>)
      : null
    const createdFromData = time ? asFiniteNumber(time.created) : null
    const created = createdFromData ?? asFiniteNumber(row.time_created) ?? 0
    const completed = time ? asFiniteNumber(time.completed) : null
    const agent = asString(rec.agent)

    rows.push({
      ...rec,
      id,
      sessionID,
      role: rec.role,
      time: completed === null ? { created } : { created, completed },
      ...(agent ? { agent } : {}),
      _createdSortKey: created,
    })
  }

  const sorted = rows
    .sort((a, b) => {
      if (b._createdSortKey !== a._createdSortKey) return b._createdSortKey - a._createdSortKey
      return String(b.id).localeCompare(String(a.id))
    })
    .map(({ _createdSortKey, ...item }) => item)

  return { ok: true, rows: sorted }
}

export function readToolPartsForMessagesSqlite(opts: {
  sqlitePath: string
  messageIds: string[]
}): SqliteReadResult<StoredToolPart> {
  if (opts.messageIds.length === 0) return { ok: true, rows: [] }

  const placeholders = opts.messageIds.map(() => "?").join(",")
  const sql = `SELECT id, message_id, session_id, time_created, data FROM part WHERE message_id IN (${placeholders}) ORDER BY message_id ASC, time_created ASC, id ASC`
  const result = withReadonlyDb(opts.sqlitePath, (db) =>
    db.query(sql).all(...opts.messageIds) as Array<{
      id: unknown
      message_id: unknown
      session_id: unknown
      data: unknown
    }>
  )
  if (!result.ok) return result

  const rows: StoredToolPart[] = []
  for (const row of result.value) {
    const id = asString(row.id)
    const messageID = asString(row.message_id)
    const sessionID = asString(row.session_id)
    const data = asString(row.data)
    if (!id || !messageID || !sessionID || !data) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== "object") continue

    const rec = parsed as Record<string, unknown>
    if (rec.type !== "tool") continue
    const callID = asString(rec.callID)
    const tool = asString(rec.tool)
    const state = rec.state
    const stateRec = state && typeof state === "object" ? (state as Record<string, unknown>) : null
    const status = stateRec ? stateRec.status : null
    const input = stateRec ? stateRec.input : null
    if (!callID || !tool || !stateRec || !isToolStatus(status) || !input || typeof input !== "object") continue

    rows.push({
      ...(rec as StoredToolPart),
      id,
      messageID,
      sessionID,
      type: "tool",
      callID,
      tool,
      state: {
        ...(stateRec as Record<string, unknown>),
        status,
        input: input as Record<string, unknown>,
      } as StoredToolPart["state"],
    })
  }

  return { ok: true, rows }
}

export type TodoItem = {
  content: string
  status: string
  priority: string
  position: number
}

export function readTodosSqlite(opts: {
  sqlitePath: string
  sessionId: string
}): SqliteReadResult<TodoItem> {
  const result = withReadonlyDb(opts.sqlitePath, (db) => {
    try {
      return db
        .query("SELECT content, status, priority, position FROM todo WHERE session_id = ? ORDER BY position ASC")
        .all(opts.sessionId) as Array<{
        content: unknown
        status: unknown
        priority: unknown
        position: unknown
      }>
    } catch (error) {
      // If the todo table doesn't exist, return empty array
      const message = error instanceof Error ? error.message.toLowerCase() : ""
      if (message.includes("no such table")) {
        return []
      }
      throw error
    }
  })
  if (!result.ok) return result

  const rows: TodoItem[] = []
  for (const row of result.value) {
    const content = asString(row.content)
    const status = asString(row.status)
    const priority = asString(row.priority)
    const position = asFiniteNumber(row.position)
    if (!content || !status || !priority || position === null) continue

    rows.push({
      content,
      status,
      priority,
      position,
    })
  }

  return { ok: true, rows }
}

export function isSqliteUsable(sqlitePath: string): boolean {
  if (!fs.existsSync(sqlitePath)) return false

  let db: BunDatabase | null = null
  try {
    db = new BunDatabase(sqlitePath, { readonly: true })
    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('session', 'message', 'part')")
      .all() as Array<{ name?: string }>

    const names = new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === "string"))
    const ok = REQUIRED_TABLES.every((table) => names.has(table))
    return ok
  } catch (error) {
    const reason = classifySqliteError(error)
    // If the DB file exists but is temporarily busy or unopenable (e.g. Windows
    // file locking), we still treat SQLite as the active backend instead of
    // falling back to legacy files. Once oh-my-opencode has migrated to SQLite,
    // the legacy file storage is no longer authoritative and may be stale or only
    // partially migrated. Falling back in this situation would make the dashboard
    // read from outdated data indefinitely, effectively "breaking" it until the
    // user manually cleans up the storage. By returning true here we keep SQLite
    // as the single source of truth and surface a temporary "Disconnected" state
    // rather than silently reverting to inconsistent legacy data.
    if (reason === "db_busy" || reason === "db_unopenable") {
      return true
    }
    return false
  } finally {
    try {
      db?.close()
    } catch {
    }
  }
}

export function selectStorageBackend(opts?: {
  env?: Env
  homedir?: string
  dataDir?: string
}): StorageBackend {
  const dataDir = opts?.dataDir ?? getDataDir(opts?.env, opts?.homedir)
  const sqlitePath = getOpenCodeSqlitePath(dataDir)
  if (isSqliteUsable(sqlitePath)) {
    return {
      kind: "sqlite",
      dataDir,
      sqlitePath,
    }
  }

  return {
    kind: "files",
    dataDir,
    storageRoot: getOpenCodeStorageDirFromDataDir(dataDir),
  }
}

export function getLegacyStorageRootForBackend(backend: StorageBackend): string {
  return getOpenCodeStorageDirFromDataDir(backend.dataDir)
}
