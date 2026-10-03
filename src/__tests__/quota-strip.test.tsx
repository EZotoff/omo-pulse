import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QuotaStrip, visibleWindows } from "../ui/components/QuotaStrip"
import type { QuotaWindow } from "../types"

function win(id: string, usedPercent: number): QuotaWindow {
  return { id, shortLabel: id.toUpperCase(), label: id, usedPercent, resetsAtMs: null }
}

describe("visibleWindows", () => {
  it("hides shorter windows when a longer one is exhausted", () => {
    const windows = [win("5h", 22), win("weekly", 40), win("monthly", 100)]
    expect(visibleWindows(windows).map((w) => w.id)).toEqual(["monthly"])
  })

  it("hides only the 5h window when weekly is exhausted", () => {
    const windows = [win("5h", 22), win("weekly", 100), win("monthly", 40)]
    expect(visibleWindows(windows).map((w) => w.id)).toEqual(["weekly", "monthly"])
  })

  it("keeps everything when nothing is exhausted", () => {
    const windows = [win("5h", 99), win("weekly", 70), win("monthly", 20)]
    expect(visibleWindows(windows)).toEqual(windows)
  })

  it("keeps everything when only the shortest window is exhausted", () => {
    const windows = [win("5h", 100), win("weekly", 40), win("monthly", 10)]
    expect(visibleWindows(windows)).toEqual(windows)
  })

  it("sorts windows shortest-to-longer regardless of payload order", () => {
    const windows = [win("monthly", 100), win("5h", 22), win("weekly", 40)]
    expect(visibleWindows(windows).map((w) => w.id)).toEqual(["monthly"])
    const all = [win("monthly", 10), win("5h", 22), win("weekly", 40)]
    expect(visibleWindows(all).map((w) => w.id)).toEqual(["5h", "weekly", "monthly"])
  })

  it("handles single and empty lists", () => {
    expect(visibleWindows([])).toEqual([])
    expect(visibleWindows([win("monthly", 100)])).toEqual([win("monthly", 100)])
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
