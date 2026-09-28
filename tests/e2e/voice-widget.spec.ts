import { test, expect } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as sleep } from "node:timers/promises"

/* ── VoiceWidget e2e ──
   Scenario 1 boots a stub voice-bridge plus the real API dev server (with its
   /api/voice-ws proxy) and walks the full loop: connect → view-context at the
   stub → show rendered → selection round-trip. Scenario 2 runs with no bridge
   and asserts the widget is a quiet offline (hidden, no error banner).
   No audio assertions: the stub exercises the text frame path only. */

const ROOT = process.cwd() // playwright always runs from the project root
const EVIDENCE = join(ROOT, ".sisyphus", "evidence")
const API_PORT = 18031 // must match voiceWsUrl()'s dev default
const TOKEN_PATH = join(homedir(), ".local", "state", "voice-bridge", "token")

const NOW = Date.now()

function makeAttentionPayload() {
  const session = (id: string, label: string, state: "question" | "working" | "error", waitMs: number) => ({
    sessionId: id,
    sessionLabel: label,
    state,
    waitMs,
  })
  const projects = [
    {
      sourceId: "proj_alpha",
      label: "Alpha",
      projectRoot: "/home/user/projects/alpha",
      next: session("ses_alpha_1", "Alpha main", "question", 42_000),
      queue: 1,
      sessions: [session("ses_alpha_1", "Alpha main", "question", 42_000)],
      busySessions: 1,
      totalSessions: 1,
    },
    {
      sourceId: "proj_beta",
      label: "Beta",
      projectRoot: "/home/user/projects/beta",
      next: session("ses_beta_1", "Beta main", "working", 5_000),
      queue: 0,
      sessions: [session("ses_beta_1", "Beta main", "working", 5_000)],
      busySessions: 1,
      totalSessions: 1,
    },
  ]
  return { projects, serverNowMs: NOW, hiddenCount: 0 }
}

async function mockAttention(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/attention", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeAttentionPayload()) }),
  )
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer()
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address()
      const port = typeof address === "object" && address !== null ? address.port : 0
      srv.close(() => (port > 0 ? resolvePort(port) : reject(new Error("no free port"))))
    })
  })
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error(`server did not come up: ${url}`)
}

type Proc = { child: ChildProcess; name: string }

async function stopProcs(procs: Proc[]): Promise<void> {
  for (const { child, name } of procs) {
    if (child.exitCode !== null) continue
    child.kill("SIGTERM")
    const deadline = Date.now() + 3_000
    while (child.exitCode === null && Date.now() < deadline) await sleep(100)
    if (child.exitCode === null) {
      child.kill("SIGKILL")
      console.log(`[voice-widget.spec] SIGKILL fallback used for ${name} (pid ${child.pid})`)
    } else {
      console.log(`[voice-widget.spec] killed ${name} (pid ${child.pid}, exit ${child.exitCode})`)
    }
  }
}

test.describe("VoiceWidget full loop against stub bridge", () => {
  const procs: Proc[] = []
  const stubLog = join(EVIDENCE, "task-5-stub-log.jsonl")
  let createdToken = false

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true })
    rmSync(stubLog, { force: true })

    // The proxy refuses upgrades (503) without the per-boot token file. The
    // real bridge rewrites it on every boot, so creating a placeholder is
    // safe; remember whether we created it to restore the prior state.
    if (!existsSync(TOKEN_PATH)) {
      mkdirSync(join(TOKEN_PATH, ".."), { recursive: true })
      writeFileSync(TOKEN_PATH, `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}\n`)
      createdToken = true
    }

    const stubPort = await freePort()
    const stubErr = "/tmp/opencode/voice-e2e-stub.err"
    const stubStderr = openSync(stubErr, "w")
    procs.push({
      child: spawn("bun", [join(ROOT, "tests", "e2e", "voice-stub-bridge.ts"), String(stubPort), stubLog], {
        cwd: ROOT,
        stdio: ["ignore", "ignore", stubStderr],
      }),
      name: "stub-bridge",
    })
    // Stub answers non-voice HTTP with 426 — any response means it booted.
    {
      const deadline = Date.now() + 10_000
      let booted = false
      while (Date.now() < deadline && !booted) {
        try {
          await fetch(`http://127.0.0.1:${stubPort}/health`)
          booted = true
        } catch {
          await sleep(200)
        }
      }
      if (!booted) throw new Error(`stub bridge did not boot (stderr: ${readFileSync(stubErr, "utf8")})`)
    }
    procs.push({
      child: spawn("bun", [join("src", "server", "dev.ts")], {
        cwd: ROOT,
        env: { ...process.env, OMO_PULSE_API_PORT: String(API_PORT), OMO_PULSE_VOICE_BRIDGE_URL: `ws://127.0.0.1:${stubPort}` },
        stdio: "ignore",
      }),
      name: "api-server",
    })
    await waitForHttp(`http://127.0.0.1:${API_PORT}/api/health`, 20_000)
  })

  test.afterAll(async () => {
    await stopProcs(procs)
    if (createdToken) rmSync(TOKEN_PATH, { force: true })
  })

  test("connect → view-context → show → selection round-trip", async ({ page }) => {
    await mockAttention(page)
    await page.goto("http://127.0.0.1:5173/?view=remote")
    await expect(page.locator(".focus-list")).toBeVisible()

    // Auto-connect through the proxy to the stub bridge.
    await expect(page.locator(".voice-dock .voice-status")).toHaveText("connected", { timeout: 10_000 })

    // Change selection (keyboard "k" moves to the last-ranked session) → the
    // dock sends a view-context frame; the stub validates and answers show.
    await page.keyboard.press("k")
    await expect(page.locator(".focus-target--selected")).toHaveCount(1)
    await expect(page.locator(".voice-dock .showview[data-view='choice']")).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(".voice-dock .showview-option")).toHaveCount(2)

    // Tap option 2 → selection frame {contextTag:'ctx-1', index:1} at the stub.
    await page.locator(".voice-dock .showview-option[data-index='1']").click()

    const deadline = Date.now() + 5_000
    let selection: { frame?: { type?: string; contextTag?: string; index?: number } } | undefined
    let viewContextOk = false
    while (Date.now() < deadline) {
      if (existsSync(stubLog)) {
        const lines = readFileSync(stubLog, "utf8").split("\n").filter((line) => line.length > 0)
        viewContextOk = lines.some((line) => line.includes('"assert-view-context"') && line.includes('"ok":true'))
        for (const line of lines) {
          const entry = JSON.parse(line) as { dir: string; frame?: { type?: string; contextTag?: string; index?: number } }
          if (entry.dir === "in" && entry.frame?.type === "selection") selection = entry
        }
      }
      if (selection !== undefined && viewContextOk) break
      await sleep(200)
    }
    expect(viewContextOk, "stub validated the view-context frame").toBe(true)
    expect(selection?.frame?.contextTag).toBe("ctx-1")
    expect(selection?.frame?.index).toBe(1)

    await page.screenshot({ path: join(EVIDENCE, "task-5-e2e-loop.png"), fullPage: true })
  })
})

test.describe("VoiceWidget bridge absent → quiet offline", () => {
  test("widget hides and no error banner appears", async ({ page }) => {
    await mockAttention(page)
    await page.goto("/?view=remote")
    await expect(page.locator(".focus-list")).toBeVisible()

    // No bridge/proxy behind the widget's first connect attempt: it stays
    // invisible — quiet offline, no error surface.
    await expect(page.locator(".voice-dock")).toHaveCount(0)
    await expect(page.locator("[role='alert']")).toHaveCount(0)

    // Rest of the remote UI stays functional.
    await expect(page.locator(".focus-next")).toBeVisible()
    await expect(page.locator(".focus-target").first()).toBeVisible()

    await page.screenshot({ path: join(EVIDENCE, "task-5-offline.png"), fullPage: true })
  })
})
