// Stub voice-bridge for the VoiceWidget e2e (run by `bun`, never vitest/Node).
//
// Accepts the proxy's `client=dash` connection, logs every inbound frame as a
// JSONL line, asserts the view-context frame content, and answers the first
// view-context with a `choice` show frame (ctx-1, two options) so the widget
// loop can complete: view-context → show → selection round-trip.
//
// Usage: bun tests/e2e/voice-stub-bridge.ts <port> <logfile>

import { appendFileSync } from "node:fs"

const port = Number(process.argv[2] ?? "18299")
const logPath = process.argv[3] ?? "/tmp/opencode/voice-stub-bridge.jsonl"

function log(entry) {
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`)
}

function assertViewContext(frame) {
  const problems = []
  if (frame.view !== "attention") problems.push(`view=${frame.view}`)
  if (typeof frame.project?.id !== "string" || frame.project.id.length === 0) problems.push("project.id")
  if (typeof frame.project?.name !== "string" || frame.project.name.length === 0) problems.push("project.name")
  if (typeof frame.session?.id !== "string" || frame.session.id.length === 0) problems.push("session.id")
  if (typeof frame.session?.title !== "string") problems.push("session.title")
  if (!["waiting", "running", "error"].includes(frame.session?.state)) problems.push("session.state")
  if (!Array.isArray(frame.recent) || frame.recent.length === 0 || frame.recent.length > 5) problems.push("recent")
  return problems
}

const showFrame = JSON.stringify({
  type: "show",
  view: "choice",
  title: "Pick one",
  contextTag: "ctx-1",
  payload: { options: [{ label: "Option One" }, { label: "Option Two" }] },
})

Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request, server) {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/voice")) {
      const upgraded = server.upgrade(request, { data: { path: url.pathname } })
      if (upgraded) return undefined
    }
    return new Response("upgrade required", { status: 426 })
  },
  websocket: {
    open(ws) {
      log({ dir: "bridge-open", path: ws.data.path })
    },
    message(ws, message) {
      if (typeof message !== "string") return
      let frame
      try {
        frame = JSON.parse(message)
      } catch {
        log({ dir: "in", raw: message })
        return
      }
      log({ dir: "in", frame })
      if (frame.type === "view-context") {
        const problems = assertViewContext(frame)
        log({ dir: "assert-view-context", ok: problems.length === 0, problems })
        if (problems.length === 0) ws.send(showFrame)
      }
    },
    close() {
      log({ dir: "bridge-close" })
    },
  },
})

log({ dir: "stub-start", port })
console.log(`[voice-stub-bridge] listening on 127.0.0.1:${port}`)
