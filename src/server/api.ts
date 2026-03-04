import { Hono } from "hono"
import * as path from "node:path"
import * as fs from "node:fs"
import { homedir } from "node:os"
import { listSources, getDefaultSourceId, addOrUpdateSource } from "../ingest/sources-registry"
import { getStorageRoots, getMessageDir } from "../ingest/session"
import { assertAllowedPath } from "../ingest/paths"
import { deriveToolCalls, MAX_TOOL_CALL_MESSAGES, MAX_TOOL_CALLS } from "../ingest/tool-calls"
import { deriveToolCallsSqlite } from "../ingest/sqlite-derive"
import type { StorageBackend } from "../ingest/storage-backend"
import { createMultiProjectService } from "./multi-project"

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export function createApi(opts: {
  storageRoot: string
  storageBackend: StorageBackend
  pollIntervalMs?: number
  version?: string
}): Hono {
  const api = new Hono()
  const version = opts.version ?? "0.0.0"

  const multiProjectService = createMultiProjectService({
    storageRoot: opts.storageRoot,
    storageBackend: opts.storageBackend,
    pollIntervalMs: opts.pollIntervalMs,
  })

  // ---------------------------------------------------------------------------
  // Middleware: no-cache + JSON content type on all API responses
  // ---------------------------------------------------------------------------
  api.use("*", async (c, next) => {
    await next()
    c.header("Cache-Control", "no-cache")
    c.header("Content-Type", "application/json")
  })

  // ---------------------------------------------------------------------------
  // Error handler: catch unhandled errors, return { ok: false, error }
  // ---------------------------------------------------------------------------
  api.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ ok: false, error: message }, 500)
  })

  // ---------------------------------------------------------------------------
  // GET /health
  // ---------------------------------------------------------------------------
  api.get("/health", (c) => {
    return c.json({ ok: true, version })
  })

  // ---------------------------------------------------------------------------
  // GET /sources — list all registered projects
  // ---------------------------------------------------------------------------
  api.get("/sources", (c) => {
    const sources = listSources(opts.storageRoot)
    const defaultSourceId = getDefaultSourceId(opts.storageRoot)
    return c.json({ ok: true, sources, defaultSourceId })
  })

  // ---------------------------------------------------------------------------
  // POST /sources — register a new project source
  // ---------------------------------------------------------------------------
  api.post("/sources", async (c) => {
    const body = await c.req.json<{ projectRoot?: string; label?: string }>()
    const { projectRoot, label } = body

    if (!projectRoot || typeof projectRoot !== "string" || projectRoot.trim() === "") {
      return c.json({ ok: false, error: "projectRoot is required and must be a non-empty string" }, 400)
    }

    if (!fs.existsSync(projectRoot)) {
      return c.json({ ok: false, error: "projectRoot directory does not exist" }, 400)
    }

    const sourceId = addOrUpdateSource(opts.storageRoot, projectRoot, label)
    return c.json({ ok: true, sourceId })
  })

  // ---------------------------------------------------------------------------
  // GET /projects — all projects with snapshots
  // ---------------------------------------------------------------------------
  api.get("/projects", (c) => {
    const payload = multiProjectService.getMultiProjectPayload()
    return c.json(payload)
  })

  // ---------------------------------------------------------------------------
  // GET /projects/:sourceId — single project detail
  // ---------------------------------------------------------------------------
  api.get("/projects/:sourceId", (c) => {
    const sourceId = c.req.param("sourceId")
    const payload = multiProjectService.getMultiProjectPayload()
    const project = payload.projects.find((p) => p.sourceId === sourceId)
    if (!project) {
      return c.json({ ok: false, error: "Source not found", sourceId }, 404)
    }
    return c.json(project)
  })

  // ---------------------------------------------------------------------------
  // GET /tool-calls/:sessionId — tool call details per session
  // ---------------------------------------------------------------------------
  api.get("/tool-calls/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId")
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return c.json({ ok: false, sessionId, toolCalls: [] }, 400)
    }

    const sqliteBackend = opts.storageBackend.kind === "sqlite"
      ? opts.storageBackend
      : null

    if (sqliteBackend) {
      assertAllowedPath({
        candidatePath: sqliteBackend.sqlitePath,
        allowedRoots: [sqliteBackend.sqlitePath, path.dirname(sqliteBackend.sqlitePath)],
      })

      const sqliteResult = deriveToolCallsSqlite({
        sqlitePath: sqliteBackend.sqlitePath,
        sessionId,
      })
      if (sqliteResult.ok) {
        if (!sqliteResult.value.sessionExists) {
          return c.json({ ok: false, sessionId, toolCalls: [] }, 404)
        }
        return c.json({
          ok: true,
          sessionId,
          toolCalls: sqliteResult.value.toolCalls,
          caps: {
            maxMessages: MAX_TOOL_CALL_MESSAGES,
            maxToolCalls: MAX_TOOL_CALLS,
          },
          truncated: sqliteResult.value.truncated,
        })
      }
    }

    // File-based fallback
    const legacyStorageRoot = opts.storageBackend.kind === "files"
      ? opts.storageBackend.storageRoot
      : null
    if (!legacyStorageRoot) {
      return c.json({ ok: false, sessionId, toolCalls: [] }, 500)
    }

    const storage = getStorageRoots(legacyStorageRoot)
    const messageDir = getMessageDir(storage.message, sessionId)
    if (!messageDir) {
      return c.json({ ok: false, sessionId, toolCalls: [] }, 404)
    }

    assertAllowedPath({ candidatePath: messageDir, allowedRoots: [legacyStorageRoot] })

    const { toolCalls, truncated } = deriveToolCalls({
      storage,
      sessionId,
      allowedRoots: [legacyStorageRoot],
    })

    return c.json({
      ok: true,
      sessionId,
      toolCalls,
      caps: {
        maxMessages: MAX_TOOL_CALL_MESSAGES,
        maxToolCalls: MAX_TOOL_CALLS,
      },
      truncated,
    })
  })

  // ---------------------------------------------------------------------------
  // GET /service/status — check systemd service state
  // ---------------------------------------------------------------------------
  api.get("/service/status", async (c) => {
    const servicePath = `${homedir()}/.config/systemd/user/ez-omo-dash.service`
    const installed = await Bun.file(servicePath).exists()

    let enabled = false
    let active = false

    if (installed) {
      try {
        const enabledResult = Bun.spawnSync(["systemctl", "--user", "is-enabled", "ez-omo-dash"])
        enabled = enabledResult.exitCode === 0
      } catch { /* not available */ }

      try {
        const activeResult = Bun.spawnSync(["systemctl", "--user", "is-active", "ez-omo-dash"])
        active = activeResult.exitCode === 0
      } catch { /* not available */ }
    }

    return c.json({ ok: true, installed, enabled, active })
  })

  // ---------------------------------------------------------------------------
  // POST /service/enable — enable and start the systemd service
  // ---------------------------------------------------------------------------
  api.post("/service/enable", async (c) => {
    try {
      const result = Bun.spawnSync(["systemctl", "--user", "enable", "--now", "ez-omo-dash"])
      if (result.exitCode !== 0) {
        return c.json({ ok: false, error: "Failed to enable service" }, 500)
      }
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 500)
    }
  })

  // ---------------------------------------------------------------------------
  // POST /service/disable — disable and stop the systemd service
  // ---------------------------------------------------------------------------
  api.post("/service/disable", async (c) => {
    try {
      const result = Bun.spawnSync(["systemctl", "--user", "disable", "--now", "ez-omo-dash"])
      if (result.exitCode !== 0) {
        return c.json({ ok: false, error: "Failed to disable service" }, 500)
      }
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 500)
    }
  })

  return api
}
