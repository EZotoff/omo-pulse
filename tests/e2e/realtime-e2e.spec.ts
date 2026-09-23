import { test, expect } from "@playwright/test"
import * as http from "node:http"
import { mkdirSync } from "node:fs"
import type { DashboardMultiProjectPayload } from "../../src/types"

test.describe.configure({ mode: "serial" })

let server: http.Server | null = null
let sseClients: Set<http.ServerResponse> = new Set()
let currentPayload: DashboardMultiProjectPayload

function createMockProjectPayload(updatedIso: string): DashboardMultiProjectPayload {
  return {
    projects: [
      {
        sourceId: "proj_realtime_test",
        label: "Realtime Test Project",
        projectRoot: "/tmp/proj_realtime_test",
        lastActivityMs: Date.now(),
        lastUpdatedMs: Date.now(),
        sessions: [
          {
            sessionId: "ses_rt_001",
            sessionLabel: "Main session",
            status: "busy",
            lastUpdated: updatedIso,
          },
        ],
        mainSession: {
          agent: "sisyphus",
          currentModel: "claude-sonnet-4-20250514",
          currentTool: "edit",
          lastUpdated: updatedIso,
          sessionLabel: "Main session",
          sessionId: "ses_rt_001",
          status: "busy",
        },
        planProgress: {
          name: "Test Plan",
          completed: 1,
          total: 2,
          path: "/tmp/plans/test.md",
          status: "in progress",
          steps: [
            { checked: true, text: "Step 1" },
            { checked: false, text: "Step 2" },
          ],
          planStale: false,
          planComplete: false,
        },
        timeSeries: {
          windowMs: 60_000,
          bucketMs: 60_000,
          buckets: 1,
          anchorMs: Date.now() - 60_000,
          serverNowMs: Date.now(),
          series: [
            {
              id: "tokens",
              label: "Tokens",
              tone: "teal",
              values: [100],
            },
          ],
        },
        sessionTimeSeries: {
          windowMs: 60_000,
          bucketMs: 60_000,
          buckets: 1,
          anchorMs: Date.now() - 60_000,
          serverNowMs: Date.now(),
          sessions: [],
        },
        backgroundTasks: [],
        tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        lastUpdatedMs: Date.now(),
      },
    ],
    serverNowMs: Date.now(),
    pollIntervalMs: 2200,
  }
}

function triggerRefreshEvent() {
  const frame = `event: refresh\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`
  for (const client of sseClients) {
    client.write(frame)
  }
}

test.beforeAll(async () => {
  sseClients.clear()
  currentPayload = createMockProjectPayload(new Date(Date.now() - 300_000).toISOString()) // 5m ago

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:18031")

    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      res.write(": heartbeat\n\n")
      sseClients.add(res)
      req.on("close", () => {
        sseClients.delete(res)
      })
      return
    }

    if (url.pathname === "/api/projects") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      })
      res.end(JSON.stringify(currentPayload))
      return
    }

    if (url.pathname === "/api/quotas") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, quotas: [] }))
      return
    }

    if (url.pathname === "/api/service/status") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, status: "inactive" }))
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: false, error: "not found" }))
  })

  await new Promise<void>((resolve) => {
    server?.listen(18031, "127.0.0.1", () => resolve())
  })

  mkdirSync(".sisyphus/evidence", { recursive: true })
})

test.afterAll(async () => {
  for (const client of sseClients) {
    try {
      client.end()
    } catch {
      // ignore
    }
  }
  sseClients.clear()

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve())
    })
    server = null
  }
})

test.describe("T6: Real-time SSE subscription & connection-health badge", () => {
  test("Scenario (a): Happy path — dashboard updates within 1000ms of a refresh event", async ({ page }) => {
    // 1. Navigate to dashboard
    await page.goto("/")

    // Wait for project strip to appear
    const strip = page.locator(".project-strip").first()
    await expect(strip).toBeVisible({ timeout: 10_000 })

    // Connection badge should show "live"
    const badge = page.locator(".dashboard-header__connection-badge, .connection-badge")
    await expect(badge).toBeVisible({ timeout: 5000 })
    await expect(badge).toContainText("live")
    await expect(badge).toHaveAttribute("data-connection", "live")

    // Capture initial lastUpdated text in project strip
    const updatedSpan = strip.locator(".strip-updated")
    await expect(updatedSpan).toBeVisible()
    const initialText = await updatedSpan.innerText()
    expect(initialText).toBe("5m ago")

    // Update the server's payload with fresh timestamp ("just now")
    currentPayload = createMockProjectPayload(new Date().toISOString())

    // 2. Trigger one refresh event on the bus and measure latency
    const start = performance.now()
    triggerRefreshEvent()

    // 3. Assert the "lastUpdated" DOM value changes within 1000ms
    await expect(updatedSpan).toHaveText(/0s ago|1s ago/, { timeout: 1000 })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThanOrEqual(1000)

    // Capture evidence screenshot
    await page.screenshot({ path: ".sisyphus/evidence/task-6-live-update.png" })
  })

  test("Scenario (b): Failure/edge — SSE down (503) shows 'polling' badge and keeps updating via interval", async ({ page }) => {
    // Intercept /api/events with 503
    await page.route("**/api/events", (route) => {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Realtime bus not configured (SSE disabled)" }),
      })
    })

    // Reset initial payload to 10m ago
    currentPayload = createMockProjectPayload(new Date(Date.now() - 600_000).toISOString())

    // 1. Reload the dashboard
    await page.goto("/")
    const strip = page.locator(".project-strip").first()
    await expect(strip).toBeVisible({ timeout: 10_000 })

    // 2. Assert connection badge renders "polling" (amber)
    const badge = page.locator(".dashboard-header__connection-badge, .connection-badge")
    await expect(badge).toBeVisible({ timeout: 5000 })
    await expect(badge).toContainText("polling")
    await expect(badge).toHaveAttribute("data-connection", "polling")

    const updatedSpan = strip.locator(".strip-updated")
    const initialPollingText = await updatedSpan.innerText()
    expect(initialPollingText).toBe("10m ago")
    // Change payload to distinct timestamp for fallback poll
    currentPayload = createMockProjectPayload(new Date().toISOString())

    // 3. Wait beyond interval poll period and assert data still refreshes via poll
    await expect(updatedSpan).not.toHaveText(initialPollingText, { timeout: 6000 })
    await expect(updatedSpan).toHaveText(/\d+s ago/, { timeout: 6000 })
    await expect(badge).toContainText("polling")

    // Capture evidence screenshot
    await page.screenshot({ path: ".sisyphus/evidence/task-6-polling-fallback.png" })
  })
})
