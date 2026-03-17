import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanProgress } from "../ui/components/PlanProgress"

describe("PlanProgress", () => {
  const baseProgress = {
    name: "test-plan",
    completed: 5,
    total: 10,
    path: "/plan.md",
    status: "in progress" as const,
    steps: [],
    planStale: false,
    planComplete: false,
  }

  it("renders active progress UI when boulderStatus is missing or active", () => {
    const compactHtml1 = renderToStaticMarkup(<PlanProgress planProgress={baseProgress} mode="compact" />)
    expect(compactHtml1).toContain("5/10")

    const progressActive = { ...baseProgress, boulderStatus: "active" as const }
    const compactHtml2 = renderToStaticMarkup(<PlanProgress planProgress={progressActive} mode="compact" />)
    expect(compactHtml2).toContain("5/10")

    const fullHtml = renderToStaticMarkup(<PlanProgress planProgress={progressActive} mode="full" />)
    expect(fullHtml).toContain("test-plan")
    expect(fullHtml).toContain("in progress")
    expect(fullHtml).toContain("progress-fill")
  })

  it("renders completed UI safely when completedAt is valid", () => {
    const validDate = "2025-01-01T12:00:00Z"
    const progress = {
      ...baseProgress,
      boulderStatus: "completed" as const,
      completedAt: validDate
    }

    const formattedDate = new Date(validDate).toLocaleString()

    const compactHtml = renderToStaticMarkup(<PlanProgress planProgress={progress} mode="compact" />)
    expect(compactHtml).toContain("✓")
    expect(compactHtml).toContain(`title="Completed at: ${formattedDate}"`)

    const fullHtml = renderToStaticMarkup(<PlanProgress planProgress={progress} mode="full" />)
    expect(fullHtml).toContain("Completed")
    expect(fullHtml).toContain(formattedDate)
  })

  it("renders completed UI safely when completedAt is invalid or missing", () => {
    const progressInvalid = {
      ...baseProgress,
      boulderStatus: "completed" as const,
      completedAt: "not-a-date"
    }

    const compactHtml1 = renderToStaticMarkup(<PlanProgress planProgress={progressInvalid} mode="compact" />)
    expect(compactHtml1).toContain("✓")
    expect(compactHtml1).toContain('title="Completed"')
    expect(compactHtml1).not.toContain("Invalid Date")

    const fullHtml1 = renderToStaticMarkup(<PlanProgress planProgress={progressInvalid} mode="full" />)
    expect(fullHtml1).toContain("Completed")
    expect(fullHtml1).not.toContain("Invalid Date")

    const progressMissing = {
      ...baseProgress,
      boulderStatus: "completed" as const,
    }

    const compactHtml2 = renderToStaticMarkup(<PlanProgress planProgress={progressMissing} mode="compact" />)
    expect(compactHtml2).toContain("✓")

    const fullHtml2 = renderToStaticMarkup(<PlanProgress planProgress={progressMissing} mode="full" />)
    expect(fullHtml2).toContain("Completed")
  })
})
