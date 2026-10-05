import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QuotaStrip, cutCornerPath, pointAtFraction, windowStates } from "../ui/components/QuotaStrip"
import type { QuotaWindow } from "../types"

function win(id: string, usedPercent: number): QuotaWindow {
  return { id, shortLabel: id.toUpperCase(), label: id, usedPercent, resetsAtMs: null }
}

describe("windowStates", () => {
  it("marks shorter windows suppressed when a longer one is exhausted", () => {
    const states = windowStates([win("5h", 22), win("weekly", 40), win("monthly", 100)])
    expect(states.map((s) => s.suppressed)).toEqual([true, true, false])
    expect(states.map((s) => s.id)).toEqual(["5h", "weekly", "monthly"])
  })

  it("suppresses only the 5h window when weekly is exhausted", () => {
    const states = windowStates([win("5h", 22), win("weekly", 100), win("monthly", 40)])
    expect(states.map((s) => s.suppressed)).toEqual([true, false, false])
  })

  it("marks nothing suppressed when no window is exhausted", () => {
    const states = windowStates([win("5h", 99), win("weekly", 70), win("monthly", 20)])
    expect(states.every((s) => !s.suppressed)).toBe(true)
  })

  it("marks nothing suppressed when only the shortest window is exhausted", () => {
    const states = windowStates([win("5h", 100), win("weekly", 40), win("monthly", 10)])
    expect(states.every((s) => !s.suppressed)).toBe(true)
  })

  it("sorts windows shortest-to-longer regardless of payload order", () => {
    expect(windowStates([win("monthly", 10), win("5h", 22), win("weekly", 40)]).map((s) => s.id)).toEqual([
      "5h",
      "weekly",
      "monthly",
    ])
  })

  it("handles single and empty lists", () => {
    expect(windowStates([])).toEqual([])
    expect(windowStates([win("monthly", 100)])).toEqual([{ ...win("monthly", 100), suppressed: false }])
  })
})

describe("pointAtFraction", () => {
  const side = 30
  const c = 0.253284 * side

  it("starts at the chamfer's upper corner", () => {
    const pt = pointAtFraction(side, 0)
    expect(pt.x).toBeCloseTo(c, 5)
    expect(pt.y).toBe(0)
  })

  it("ends back at the anchor after a full lap", () => {
    const pt = pointAtFraction(side, 1)
    expect(pt.x).toBeCloseTo(c, 5)
    expect(pt.y).toBeCloseTo(0, 5)
  })

  it("reaches the amber start (left edge, above the bottom-left arc) at 75%", () => {
    const r = 0.209419 * side
    const pt = pointAtFraction(side, 0.75)
    expect(pt.x).toBeCloseTo(0, 3)
    expect(pt.y).toBeCloseTo(side - r, 3)
  })

  it("reaches the red start (chamfer's lower corner) at 90%", () => {
    const c = 0.253284 * side
    const pt = pointAtFraction(side, 0.9)
    expect(pt.x).toBeCloseTo(0, 3)
    expect(pt.y).toBeCloseTo(c, 3)
  })

  it("stays inside the ring bounds for every fraction", () => {
    for (let i = 0; i <= 100; i++) {
      const pt = pointAtFraction(side, i / 100)
      expect(pt.x).toBeGreaterThanOrEqual(-0.01)
      expect(pt.x).toBeLessThanOrEqual(side + 0.01)
      expect(pt.y).toBeGreaterThanOrEqual(-0.01)
      expect(pt.y).toBeLessThanOrEqual(side + 0.01)
    }
  })
})

describe("cutCornerPath", () => {
  it("starts at the chamfer's upper corner and closes over the chamfer", () => {
    const side = 30
    const c = 0.253284 * side
    expect(cutCornerPath(side)).toMatch(new RegExp(`^M ${c.toFixed(2)} 0`))
    expect(cutCornerPath(side)).toMatch(/Z$/)
  })
})

describe("QuotaStrip styles", () => {
  const payload = {
    providers: [
      {
        providerId: "test",
        name: "Test",
        symbol: "T",
        icon: null,
        windows: [win("5h", 45), win("weekly", 95)],
        status: "ok" as const,
        fetchedAtMs: 0,
      },
    ],
    serverNowMs: 0,
  }

  it.each([
    ["bars", "quota-strip__line", 2],
    ["rings", "quota-ring", 2],
    ["leds", "quota-leds", 2],
    ["chips", "quota-chip", 2],
    ["type", "quota-type", 2],
  ] as const)("renders style %s with one indicator per window", (style, cls, expected) => {
    const markup = renderToStaticMarkup(
      <QuotaStrip quotas={payload} iconMode="codes" style={style} ringSize={27} />,
    )
    const matches = markup.match(new RegExp(`class="[^"]*${cls}`, "g")) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(expected)
    expect(markup).toContain(`data-style="${style}"`)
  })

  it("keeps the exhausted provider visible with the empty placeholder for non-ok status", () => {
    const errored = { ...payload, providers: [{ ...payload.providers[0], status: "error" as const, windows: [] }] }
    const markup = renderToStaticMarkup(<QuotaStrip quotas={errored} iconMode="codes" style="rings" ringSize={27} />)
    expect(markup).toContain("data-status=\"error\"")
    expect(markup).toContain("quota-strip__track")
  })
})
