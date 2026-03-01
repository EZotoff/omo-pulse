import { test, expect, type Page } from "@playwright/test"

/* ── Mock Data ── */

const NOW = Date.now()

function makeMockTimeSeries(buckets = 30) {
  return {
    windowMs: 60_000 * buckets,
    bucketMs: 60_000,
    buckets,
    anchorMs: NOW - 60_000 * buckets,
    serverNowMs: NOW,
    series: [
      {
        id: "tokens",
        label: "Tokens",
        tone: "teal" as const,
        values: Array.from({ length: buckets }, () => Math.floor(Math.random() * 500)),
      },
    ],
  }
}

function makeMockSessionTimeSeries(buckets = 30) {
  return {
    windowMs: 60_000 * buckets,
    bucketMs: 60_000,
    buckets,
    anchorMs: NOW - 60_000 * buckets,
    serverNowMs: NOW,
    sessions: [
      {
        sessionId: "ses_main_001",
        sessionLabel: "Main",
        isBackground: false,
        values: Array.from({ length: buckets }, () => Math.floor(Math.random() * 300)),
      },
    ],
  }
}

function makeMockProject(id: string, label: string, status: "busy" | "idle" = "busy") {
  return {
    sourceId: id,
    label,
    projectRoot: `/home/user/projects/${id}`,
    mainSession: {
      agent: "sisyphus",
      currentModel: "claude-sonnet-4-20250514",
      currentTool: status === "busy" ? "edit" : "",
      lastUpdated: new Date(NOW - 5_000).toISOString(),
      sessionLabel: "Main session",
      sessionId: `ses_${id}_001`,
      status,
    },
    planProgress: {
      name: `${label} plan`,
      completed: 3,
      total: 8,
      path: `/plans/${id}.md`,
      status: "in progress" as const,
      steps: [
        { checked: true, text: "Set up project structure" },
        { checked: true, text: "Create data layer" },
        { checked: true, text: "Build UI components" },
        { checked: false, text: "Add tests" },
        { checked: false, text: "Polish and deploy" },
        { checked: false, text: "Write documentation" },
        { checked: false, text: "Code review" },
        { checked: false, text: "Release" },
      ],
      planStale: false,
      planComplete: false,
    },
    timeSeries: makeMockTimeSeries(),
    sessionTimeSeries: makeMockSessionTimeSeries(),
    backgroundTasks: [],
    tokenUsage: { inputTokens: 12500, outputTokens: 8300, totalTokens: 20800 },
    lastUpdatedMs: NOW - 2_000,
  }
}

function makeMockPayload(projectCount = 3) {
  const projects = Array.from({ length: projectCount }, (_, i) =>
    makeMockProject(`proj_${i}`, `Project ${i}`, i === 0 ? "busy" : "idle"),
  )
  return {
    projects,
    serverNowMs: NOW,
    pollIntervalMs: 2200,
  }
}

/* ── Route Setup ── */

/** Intercept /api/projects with mock data, return a ref to allow changing payload mid-test */
async function setupMockApi(page: Page, payload = makeMockPayload()) {
  let currentPayload = payload
  await page.route("**/api/projects", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(currentPayload),
    })
  })
  return {
    updatePayload(next: typeof payload) {
      currentPayload = next
    },
  }
}

/* ── Tests ── */

test.describe("Dashboard E2E", () => {
  test("loads and shows project strips", async ({ page }) => {
    await setupMockApi(page)
    await page.goto("/")

    // Header should be visible
    await expect(page.locator(".dashboard-header__title")).toHaveText("ez-omo-dash")
    await expect(page.locator(".dashboard-header__count")).toHaveText("3 projects")

    // All 3 project strips should render
    const strips = page.locator(".project-strip")
    await expect(strips).toHaveCount(3)

    // First strip should show the project label
    await expect(strips.first().locator(".strip-label")).toBeVisible()
  })

  test("strip expand/collapse toggles", async ({ page }) => {
    await setupMockApi(page)
    await page.goto("/")

    const strip = page.locator(".project-strip").first()
    const header = strip.locator(".strip-header")
    const body = strip.locator(".strip-body")

    // Starts collapsed
    await expect(strip).toHaveAttribute("data-expanded", "false")

    // Click to expand
    await header.click()
    await expect(strip).toHaveAttribute("data-expanded", "true")

    // Body should be visible when expanded
    await expect(body).toBeVisible()

    // Click again to collapse
    await header.click()
    await expect(strip).toHaveAttribute("data-expanded", "false")
  })

  test("sparkline SVG renders correctly", async ({ page }) => {
    await setupMockApi(page)
    await page.goto("/")

    // Mini sparklines should be present in collapsed headers
    const miniSlots = page.locator(".sparkline-slot--mini")
    await expect(miniSlots.first()).toBeVisible()

    // Mini sparkline SVG should render inside the slot
    const miniSvg = miniSlots.first().locator("svg.sparkline--mini")
    await expect(miniSvg).toBeVisible()

    // Expand a strip and verify full sparkline
    await page.locator(".strip-header").first().click()
    const fullSvg = page.locator(".sparkline-slot--full svg.sparkline--full").first()
    await expect(fullSvg).toBeVisible()
  })

  test("plan progress shows correct content", async ({ page }) => {
    await setupMockApi(page)
    await page.goto("/")

    // Compact plan progress visible in collapsed strip
    const compactPlan = page.locator(".plan-slot--compact .plan-progress--compact").first()
    await expect(compactPlan).toBeVisible()

    // Expand and check full plan
    await page.locator(".strip-header").first().click()
    const fullPlan = page.locator(".plan-slot--full .plan-progress--full").first()
    await expect(fullPlan).toBeVisible()

    // Should show plan name in the section label
    const planLabel = page.locator(".strip-section-label").filter({ hasText: /Plan —/ }).first()
    await expect(planLabel).toBeVisible()
  })

  test("theme toggle switches dark/light", async ({ page }) => {
    await setupMockApi(page)
    await page.goto("/")

    // Get current theme (may be light in headless Chromium)
    const html = page.locator("html")
    const initialTheme = await html.getAttribute("data-theme")

    // Click theme toggle
    const toggle = page.locator(".theme-toggle")
    await toggle.click()

    // Should switch to opposite theme
    const expectedAfterClick = initialTheme === "dark" ? "light" : "dark"
    await expect(html).toHaveAttribute("data-theme", expectedAfterClick)

    // Click again to switch back
    await toggle.click()
    await expect(html).toHaveAttribute("data-theme", initialTheme!)
  })

  test("data auto-refreshes with updated timestamp", async ({ page }) => {
    const mock = await setupMockApi(page)
    await page.goto("/")

    // Wait for initial render
    await expect(page.locator(".project-strip")).toHaveCount(3)

    // Get the initial update text from header
    const updatedEl = page.locator(".dashboard-header__updated")
    const initialText = await updatedEl.textContent()

    // Update mock payload to have a new timestamp (simulates server push)
    const updatedPayload = makeMockPayload(3)
    updatedPayload.projects[0].label = "Updated Project"
    updatedPayload.serverNowMs = Date.now()
    mock.updatePayload(updatedPayload)

    // Wait for the auto-refresh cycle (poll interval is 2.2s, give it enough time)
    await page.waitForTimeout(3_500)

    // The updated project label should appear
    await expect(page.locator(".strip-label").first()).toHaveText("Updated Project")
  })

  test("scrolling works with many projects", async ({ page }) => {
    // Create a payload with 15 projects to force scrolling
    const largePayload = makeMockPayload(15)
    await setupMockApi(page, largePayload)
    await page.goto("/")

    // Verify all 15 strips rendered
    await expect(page.locator(".project-strip")).toHaveCount(15)

    // Should show correct count in header
    await expect(page.locator(".dashboard-header__count")).toHaveText("15 projects")

    // Scroll to the last strip
    const lastStrip = page.locator(".project-strip").last()
    await lastStrip.scrollIntoViewIfNeeded()
    await expect(lastStrip).toBeVisible()
  })

  test("density mode applied based on project count", async ({ page }) => {
    // ≤5 projects → comfortable
    await setupMockApi(page, makeMockPayload(3))
    await page.goto("/")
    await expect(page.locator(".page")).toHaveAttribute("data-density", "comfortable")

    // 6-10 projects → dense
    await page.route("**/api/projects", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeMockPayload(8)),
      })
    })
    await page.goto("/")
    await expect(page.locator(".page")).toHaveAttribute("data-density", "dense")

    // 10+ projects → ultra-dense
    await page.route("**/api/projects", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeMockPayload(12)),
      })
    })
    await page.goto("/")
    await expect(page.locator(".page")).toHaveAttribute("data-density", "ultra-dense")
  })

  test("expand all and collapse all buttons work", async ({ page }) => {
    await setupMockApi(page)
    await page.goto("/")

    const strips = page.locator(".project-strip")
    await expect(strips).toHaveCount(3)

    // All should start collapsed
    for (let i = 0; i < 3; i++) {
      await expect(strips.nth(i)).toHaveAttribute("data-expanded", "false")
    }

    // Click Expand All
    await page.locator("button", { hasText: "Expand All" }).click()
    for (let i = 0; i < 3; i++) {
      await expect(strips.nth(i)).toHaveAttribute("data-expanded", "true")
    }

    // Click Collapse All
    await page.locator("button", { hasText: "Collapse All" }).click()
    for (let i = 0; i < 3; i++) {
      await expect(strips.nth(i)).toHaveAttribute("data-expanded", "false")
    }
  })
})
