import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactElement, ReactNode } from "react"
import { ShowView } from "../ui/components/ShowView"
import type { ShowFrame, ShowView as ShowViewKind } from "../ui/voice/protocol"

/* Walk a rendered element tree and invoke the onClick of the nth matching element. */
function clickElement(
  tree: ReactNode,
  targetIndex: number,
  predicate?: (element: ReactElement) => boolean,
): void {
  let seen = -1
  const visit = (node: ReactNode): void => {
    if (node === null || node === undefined || typeof node !== "object") return
    const element = node as ReactElement
    const matches = predicate
      ? predicate(element)
      : typeof element.type === "string" && element.type === "button"
    if (matches) {
      seen += 1
      if (seen === targetIndex) {
        const onClick = (element.props as { onClick?: () => void }).onClick
        if (onClick === undefined) throw new Error(`target ${targetIndex} has no onClick`)
        onClick()
        return
      }
    }
    if (typeof element.type === "function") {
      visit((element.type as (props: unknown) => ReactNode)(element.props))
      return
    }
    if (typeof element.type === "object" && element.type !== null && "type" in element.type && typeof (element.type as { type: unknown }).type === "function") {
      visit(((element.type as { type: (props: unknown) => ReactNode }).type)(element.props))
      return
    }
    const children = (element.props as { children?: ReactNode }).children
    if (Array.isArray(children)) {
      for (const child of children) visit(child)
    } else {
      visit(children)
    }
  }
  visit(tree)
}

const frame = (view: ShowViewKind, contextTag: string, title: string, payload: Record<string, unknown>): ShowFrame => ({
  type: "show",
  view,
  title,
  contextTag,
  payload,
})

describe("ShowView renderer (Seam 2)", () => {
  it("renders card view with single-item emphasis", () => {
    // Given: a card show frame / When: rendered / Then: card block with the item label
    const html = renderToStaticMarkup(
      <ShowView frame={frame("card", "ctx-1", "SESSION", { items: [{ label: "ez-omo-dash", status: "question" }] })} />,
    )
    expect(html).toContain("showview-card")
    expect(html).toContain("ez-omo-dash")
    expect(html).toContain("question")
  })

  it("renders list view with one row per item", () => {
    const html = renderToStaticMarkup(
      <ShowView frame={frame("list", "ctx-2", "OPEN ITEMS", { items: [{ label: "Q1" }, { label: "Q2" }] })} />,
    )
    expect(html.match(/showview-row"/g)).toHaveLength(2)
    expect(html).toContain("Q1")
    expect(html).toContain("Q2")
  })

  it("renders table view with columns and data rows", () => {
    const html = renderToStaticMarkup(
      <ShowView
        frame={frame("table", "ctx-3", "QUOTAS", { rows: [{ name: "Z.AI", used: "40%" }, { name: "Kimi", used: "12%" }] })}
      />,
    )
    expect(html).toContain("<table")
    expect(html.match(/showview-tr/g)).toHaveLength(2)
    expect(html).toContain("Kimi")
    expect(html).toContain("12%")
  })

  it("fires onSelect(contextTag, index) when a choice option is tapped", () => {
    // Given: a choice frame with an onSelect spy / When: option 2 is clicked / Then: onSelect("ctx-4", 1)
    const onSelect = vi.fn()
    const choiceFrame = frame("choice", "ctx-4", "DB OPTIONS", { options: [{ label: "Qdrant" }, { label: "SQLite" }] })
    const html = renderToStaticMarkup(<ShowView frame={choiceFrame} onSelect={onSelect} />)
    expect(html.match(/showview-option"/g)).toHaveLength(2)
    clickElement(<ShowView frame={choiceFrame} onSelect={onSelect} />, 1)
    expect(onSelect).toHaveBeenCalledWith("ctx-4", 1)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("fires onSelect when a list row is tapped", () => {
    const onSelect = vi.fn()
    const listFrame = frame("list", "ctx-2", "OPEN ITEMS", { items: [{ label: "Q1" }, { label: "Q2" }] })
    clickElement(<ShowView frame={listFrame} onSelect={onSelect} />, 0)
    expect(onSelect).toHaveBeenCalledWith("ctx-2", 0)
  })
  it("fires onSelect when a table row is tapped", () => {
    const onSelect = vi.fn()
    const tableFrame = frame("table", "ctx-3", "QUOTAS", { rows: [{ name: "Z.AI", used: "40%" }, { name: "Kimi", used: "12%" }] })
    clickElement(
      <ShowView frame={tableFrame} onSelect={onSelect} />,
      1,
      (el) => typeof el.type === "string" && el.type === "tr" && Boolean((el.props as { className?: string })?.className?.includes("showview-tr")),
    )
    expect(onSelect).toHaveBeenCalledWith("ctx-3", 1)
  })


  it("renders progress view with step markers and done count", () => {
    const html = renderToStaticMarkup(
      <ShowView frame={frame("progress", "ctx-5", "DEPLOY", { steps: ["build", "rsync", "restart"], done: 2 })} />,
    )
    expect(html.match(/showview-step(?![\w-])/g)).toHaveLength(3)
    expect(html.match(/showview-step done"/g)).toHaveLength(2)
    expect(html).toContain("2/3")
  })

  it("renders comparison view with two labeled columns", () => {
    const html = renderToStaticMarkup(
      <ShowView
        frame={frame("comparison", "ctx-6", "A vs B", {
          left: { label: "A", items: ["x"] },
          right: { label: "B", items: ["y"] },
        })}
      />,
    )
    expect(html.match(/showview-compare-col"/g)).toHaveLength(2)
    expect(html).toContain("A")
    expect(html).toContain("B")
    expect(html).toContain("x")
    expect(html).toContain("y")
  })

  it("renders diff view with added and removed lines", () => {
    const html = renderToStaticMarkup(
      <ShowView frame={frame("diff", "ctx-7", "PATCH", { lines: [{ kind: "add", text: "+port" }, { kind: "del", text: "-path" }] })} />,
    )
    expect(html.match(/showview-diff-line add/g)).toHaveLength(1)
    expect(html.match(/showview-diff-line del/g)).toHaveLength(1)
    expect(html).toContain("+port")
    expect(html).toContain("-path")
  })

  it("renders an unknown view as a neutral fallback card without throwing", () => {
    // Given: a frame whose view is not in the known set (additive tolerance)
    const unknown = frame("hologram" as unknown as ShowViewKind, "ctx-8", "MYSTERY", { magic: 42 })
    // When: rendered / Then: fallback card carries the raw payload, no throw
    const html = renderToStaticMarkup(<ShowView frame={unknown} />)
    expect(html).toContain("showview-fallback")
    expect(html).toContain("magic")
    expect(html).toContain("42")
  })

  it("carries data-context-tag on every rendered instance", () => {
    const html = renderToStaticMarkup(
      <ShowView frame={frame("card", "ctx-1", "SESSION", { items: [{ label: "x" }] })} />,
    )
    expect(html).toContain('data-context-tag="ctx-1"')
  })
})
