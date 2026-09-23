import { test, expect, type Page, type Route } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdirSync } from "node:fs"
import * as net from "node:net"
import * as path from "node:path"
import type { AttentionPayload } from "../../src/types"

/**
 * Focus Remote — supervisor Escalations section (Seam 4, fixture-driven).
 *
 * Spawns REAL API servers (`bun src/server/dev.ts`) with
 * OMO_PULSE_SUPERVISOR_STATE_DIR pointing at fixture dirs under
 * tests/e2e/fixtures/supervisor/ — the /api/supervisor/queue response is
 * produced by the real reader, never mocked. All other API routes the UI
 * touches are fulfilled in-browser so the scenarios stay deterministic.
 *
 * Server ports are probed free at runtime (outside the vite-proxy range
 * 18030-18039) and both servers are killed in afterAll.
 */

import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(here, "fixtures/supervisor/task4")
const EMPTY_DIR = path.resolve(here, "fixtures/supervisor/task4-empty")

type SpawnedServer = { proc: ChildProcess; port: number }

async function probeFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

async function spawnApiServer(stateDir: string): Promise<SpawnedServer> {
  const port = await probeFreePort()
  const proc = spawn("bun", ["src/server/dev.ts"], {
    cwd: path.resolve(here, "../.."),
    env: {
      ...process.env,
      OMO_PULSE_API_PORT: String(port),
      OMO_PULSE_SUPERVISOR_STATE_DIR: stateDir,
    },
    stdio: "ignore",
  })
  return { proc, port }
}

async function waitForReady(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`API server on :${port} did not become ready`)
}

function makeAttentionPayload(): AttentionPayload {
  return {
    projects: [
      {
        sourceId: "proj_alpha",
        label: "Alpha Project",
        projectRoot: "/tmp/opencode/proj_alpha",
        next: null,
        queue: 0,
        sessions: [
          {
            sessionId: "ses_alpha_001",
            sessionLabel: "Alpha main",
            state: "idle",
            waitMs: 60_000,
          },
        ],
        busySessions: 0,
        totalSessions: 1,
      },
    ],
    serverNowMs: Date.now(),
    hiddenCount: 0,
  }
}

const NOW = Date.now()

function makeDashboardProject(sourceId: string, label: string, sessionId: string) {
  const NOW2 = Date.now()
  return {
    sourceId,
    label,
    projectRoot: `/tmp/opencode/${sourceId}`,
    mainSession: {
      agent: "sisyphus",
      currentModel: "test-model",
      currentTool: "",
      lastUpdated: new Date(NOW2 - 5_000).toISOString(),
      sessionLabel: "Alpha main",
      sessionId,
      status: "idle" as const,
    },
    sessions: [],
    aggregateStatus: "idle" as const,
    planProgress: {
      name: "plan",
      completed: 0,
      total: 1,
      path: `/plans/${sourceId}.md`,
      status: "in progress" as const,
      steps: [{ checked: false, text: "step" }],
      planStale: false,
      planComplete: false,
    },
    unintiatedPlans: [],
    timeSeries: {
      windowMs: 60_000 * 30,
      bucketMs: 60_000,
      buckets: 30,
      anchorMs: NOW2 - 60_000 * 30,
      serverNowMs: NOW2,
      series: [],
    },
    sessionTimeSeries: {
      windowMs: 60_000 * 30,
      bucketMs: 60_000,
      buckets: 30,
      anchorMs: NOW2 - 60_000 * 30,
      serverNowMs: NOW2,
      sessions: [
        { sessionId, sessionLabel: "Alpha main", isBackground: false, values: Array.from({ length: 30 }, () => 0) },
      ],
    },
    backgroundTasks: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    lastUpdatedMs: NOW2 - 2_000,
    lastActivityMs: NOW2 - 5_000,
  }
}

/**
 * Fulfill the API routes the focus remote + dashboard shell touch, proxying
 * /api/supervisor/queue to the given real server.
 */
async function setupRouting(page: Page, supervisorPort: number): Promise<void> {
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/api/supervisor/queue") {
      try {
        const res = await fetch(`http://127.0.0.1:${supervisorPort}${url.pathname}`)
        await route.fulfill({
          status: res.status,
          contentType: "application/json",
          body: await res.text(),
        })
      } catch {
        await route.fulfill({ status: 502, contentType: "application/json", body: "{}" })
      }
      return
    }
    if (url.pathname === "/api/attention") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeAttentionPayload()),
      })
      return
    }
    if (url.pathname === "/api/projects") {
      /* proj_alpha snapshot lets the deep-link test assert strip selection;
         an empty list would also be valid for the remote-view tests */
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projects: [makeDashboardProject("proj_alpha", "Alpha Project", "ses_alpha_001")],
          serverNowMs: Date.now(),
          pollIntervalMs: 2200,
        }),
      })
      return
    }
    await route.continue()
  })
}

let fixtureServer: SpawnedServer | null = null
let emptyServer: SpawnedServer | null = null

test.beforeAll(async () => {
  mkdirSync(".sisyphus/evidence", { recursive: true })
  fixtureServer = await spawnApiServer(FIXTURE_DIR)
  emptyServer = await spawnApiServer(EMPTY_DIR)
  await waitForReady(fixtureServer.port)
  await waitForReady(emptyServer.port)
})

test.afterAll(async () => {
  for (const srv of [fixtureServer, emptyServer]) {
    srv?.proc.kill("SIGTERM")
  }
})

test("renders only the open, non-snoozed escalation", async ({ page }) => {
  await setupRouting(page, fixtureServer!.port)
  await page.goto("/?view=remote")
  await page.waitForLoadState("networkidle")

  const heading = page.getByTestId("escalations-heading")
  await expect(heading).toHaveText("Escalations")

  const cards = page.getByTestId("escalation-card")
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText("FIXTURE-OPEN-QUESTION-MARKER-XYZ")
  const sectionText = heading.locator("xpath=..").innerText()
  expect(await sectionText).not.toContain("FIXTURE-RESOLVED-MARKER")
  expect(await sectionText).not.toContain("FIXTURE-SNOOZED-MARKER")

  await expect(page.locator(".focus-remote")).toBeVisible()
  await page.screenshot({ path: ".sisyphus/evidence/task-4-escalations.png", fullPage: true })
})

test("hides the section entirely when the supervisor is absent", async ({ page }) => {
  await setupRouting(page, emptyServer!.port)
  await page.goto("/?view=remote")
  await page.waitForLoadState("networkidle")

  await expect(page.getByTestId("escalations-heading")).toHaveCount(0)
  await expect(page.getByTestId("escalation-card")).toHaveCount(0)
  /* Rest of the remote still functional: header + attention panel render. */
  await expect(page.locator(".focus-remote")).toBeVisible()
  await expect(page.locator(".focus-clear-panel h2")).toHaveText("All clear")

  await page.screenshot({ path: ".sisyphus/evidence/task-4-absent.png", fullPage: true })
})

test("deep-links from escalation card select the project strip in the dashboard", async ({ page }) => {
  await setupRouting(page, fixtureServer!.port)
  await page.goto("/?view=dashboard&project=proj_alpha&session=ses_alpha_001")
  await page.waitForLoadState("networkidle")

  const strip = page.locator('.project-strip[data-project-id="proj_alpha"][data-deeplink-selected="true"]')
  await expect(strip).toHaveCount(1)
  await expect(strip).toHaveAttribute("data-deeplink-session", "ses_alpha_001")
  await expect(strip).toBeVisible()

  /* Unknown project param is ignored gracefully — no crash, dashboard renders normally */
  await page.goto("/?view=dashboard&project=proj_does_not_exist&session=ses_nope")
  await expect(page.locator('.project-strip[data-deeplink-selected="true"]')).toHaveCount(0)
  await expect(page.locator('.project-strip[data-project-id="proj_alpha"]')).toHaveCount(1)

  await page.goto("/?view=dashboard&project=proj_alpha&session=ses_alpha_001")
  await expect(page.locator('.project-strip[data-project-id="proj_alpha"][data-deeplink-selected="true"]')).toBeVisible()
  await page.screenshot({ path: ".sisyphus/evidence/task-4-deeplink.png", fullPage: true })
})

test("deep-linked sessions validate membership and highlight the target session", async ({ page }) => {
  await setupRouting(page, fixtureServer!.port)

  /* Unknown session id on a known project: strip selected, session ignored */
  await page.goto("/?view=dashboard&project=proj_alpha&session=ses_unknown_999")
  await page.waitForLoadState("networkidle")
  const strip = page.locator('.project-strip[data-project-id="proj_alpha"][data-deeplink-selected="true"]')
  await expect(strip).toHaveCount(1)
  await expect(strip).not.toHaveAttribute("data-deeplink-session")
  await expect(page.locator('[data-deeplink-session-target="true"]')).toHaveCount(0)

  /* Valid session id: session attribute + swimlane target highlight render */
  await page.goto("/?view=dashboard&project=proj_alpha&session=ses_alpha_001")
  await page.waitForLoadState("networkidle")
  await expect(strip).toHaveAttribute("data-deeplink-session", "ses_alpha_001")
  const target = page.locator('.swimlane-legend-item[data-session-id="ses_alpha_001"][data-deeplink-session-target="true"]')
  await expect(target).toHaveCount(1)

  await page.screenshot({ path: ".sisyphus/evidence/task-4-deeplink-r2.png", fullPage: true })
})
