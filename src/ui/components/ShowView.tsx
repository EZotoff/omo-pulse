import { memo } from "react"
import type { ShowFrame } from "../voice/protocol"
import "./ShowView.css"

/* ── Show-view renderer (Seam 2) ──
   Pure rendering of a bridge ShowFrame: no business logic, no lifecycle,
   no mutation affordances. Selection taps bubble up via onSelect(contextTag, index). */

export type ShowViewProps = {
  readonly frame: ShowFrame
  readonly onSelect?: (contextTag: string, index: number) => void
}

const objectOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Object(value) : undefined

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

const stringOf = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

/** Label text for a collection entry: raw string or {label|text|name|title}. */
const entryText = (entry: unknown): string => {
  const direct = stringOf(entry)
  if (direct !== undefined) return direct
  const obj = objectOf(entry)
  if (obj === undefined) return ""
  const text = stringOf(obj["label"]) ?? stringOf(obj["text"]) ?? stringOf(obj["name"]) ?? stringOf(obj["title"])
  return text ?? ""
}

const entryStatus = (entry: unknown): string | undefined => {
  const obj = objectOf(entry)
  return obj === undefined ? undefined : stringOf(obj["status"])
}

/** Table columns: union of row-object keys in first-appearance order. */
function tableColumns(rows: readonly unknown[]): string[] {
  const columns: string[] = []
  for (const row of rows) {
    const obj = objectOf(row)
    if (obj === undefined) continue
    for (const key of Object.keys(obj)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  return columns
}

function cellText(row: unknown, column: string): string {
  const obj = objectOf(row)
  return obj === undefined ? entryText(row) : entryText(obj[column])
}

/* ── Per-view renderers ── */

function CardView({ frame }: { readonly frame: ShowFrame }): React.ReactNode {
  const items = arrayOf(frame.payload["items"])
  const entry = items[0]
  const status = entryStatus(entry)
  return (
    <div className="showview-card">
      <span className="showview-card-label">{entryText(entry)}</span>
      {status !== undefined && <span className="showview-chip">{status}</span>}
    </div>
  )
}

function ListView({ frame, onSelect }: { readonly frame: ShowFrame; readonly onSelect?: ShowViewProps["onSelect"] }): React.ReactNode {
  const items = arrayOf(frame.payload["items"])
  return (
    <div className="showview-list">
      {items.map((entry, index) => (
        <button
          key={index}
          type="button"
          className="showview-row"
          data-index={index}
          onClick={onSelect === undefined ? undefined : () => onSelect(frame.contextTag, index)}
        >
          <span className="showview-num">{index + 1}</span>
          <span className="showview-row-text">{entryText(entry)}</span>
        </button>
      ))}
    </div>
  )
}

function TableView({ frame, onSelect }: { readonly frame: ShowFrame; readonly onSelect?: ShowViewProps["onSelect"] }): React.ReactNode {
  const rows = arrayOf(frame.payload["rows"])
  const columns = tableColumns(rows)
  return (
    <table className="showview-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={index}
            className="showview-tr"
            data-index={index}
            onClick={onSelect === undefined ? undefined : () => onSelect(frame.contextTag, index)}
          >
            {columns.map((column) => (
              <td key={column}>
                {column === columns[0] && <span className="showview-num">{index + 1}</span>}
                {cellText(row, column)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ChoiceView({ frame, onSelect }: { readonly frame: ShowFrame; readonly onSelect?: ShowViewProps["onSelect"] }): React.ReactNode {
  const options = arrayOf(frame.payload["options"])
  return (
    <div className="showview-choices">
      {options.map((option, index) => (
        <button
          key={index}
          type="button"
          className="showview-option"
          data-index={index}
          aria-label={`Option ${index + 1}: ${entryText(option)}`}
          onClick={onSelect === undefined ? undefined : () => onSelect(frame.contextTag, index)}
        >
          <span className="showview-num">{index + 1}</span>
          <span className="showview-option-text">{entryText(option)}</span>
        </button>
      ))}
    </div>
  )
}

function ProgressView({ frame }: { readonly frame: ShowFrame }): React.ReactNode {
  const steps = arrayOf(frame.payload["steps"]).map((step, index) => entryText(step) || `Step ${index + 1}`)
  const doneRaw = frame.payload["done"]
  const done = typeof doneRaw === "number" ? Math.min(Math.max(doneRaw, 0), steps.length) : 0
  const percentRaw = frame.payload["percent"]
  const percent = typeof percentRaw === "number" ? Math.min(Math.max(percentRaw, 0), 100) : undefined
  return (
    <div className="showview-progress">
      {steps.length > 0 && (
        <ol className="showview-steps">
          {steps.map((step, index) => (
            <li key={index} className={index < done ? "showview-step done" : "showview-step"}>
              {step}
            </li>
          ))}
        </ol>
      )}
      <span className="showview-count">
        {steps.length > 0 ? `${done}/${steps.length}` : percent !== undefined ? `${percent}%` : ""}
      </span>
    </div>
  )
}

function ComparisonView({ frame }: { readonly frame: ShowFrame }): React.ReactNode {
  const side = (key: string): { label: string; items: readonly string[] } => {
    const obj = objectOf(frame.payload[key])
    return {
      label: obj === undefined ? key : stringOf(obj["label"]) ?? key,
      items: obj === undefined ? [] : arrayOf(obj["items"]).map((entry) => entryText(entry)),
    }
  }
  const left = side("left")
  const right = side("right")
  return (
    <div className="showview-compare">
      {[left, right].map((col, index) => (
        <div key={index} className="showview-compare-col">
          <h4>{col.label}</h4>
          <ul>
            {col.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function DiffView({ frame }: { readonly frame: ShowFrame }): React.ReactNode {
  const lines = arrayOf(frame.payload["lines"])
  return (
    <div className="showview-diff">
      {lines.map((line, index) => {
        const obj = objectOf(line)
        const kind = obj === undefined ? undefined : stringOf(obj["kind"])
        const text = obj === undefined ? entryText(line) : entryText(obj["text"])
        return (
          <div key={index} className={kind === "add" ? "showview-diff-line add" : kind === "del" ? "showview-diff-line del" : "showview-diff-line"}>
            {text}
          </div>
        )
      })}
    </div>
  )
}

/* ── Root component ── */

function ShowViewComponent({ frame, onSelect }: ShowViewProps): React.ReactNode {
  let body: React.ReactNode
  switch (frame.view) {
    case "card":
      body = <CardView frame={frame} />
      break
    case "list":
      body = <ListView frame={frame} onSelect={onSelect} />
      break
    case "table":
      body = <TableView frame={frame} onSelect={onSelect} />
      break
    case "choice":
      body = <ChoiceView frame={frame} onSelect={onSelect} />
      break
    case "progress":
      body = <ProgressView frame={frame} />
      break
    case "comparison":
      body = <ComparisonView frame={frame} />
      break
    case "diff":
      body = <DiffView frame={frame} />
      break
    default:
      /* Additive tolerance: unknown views from a newer bridge render as a
         neutral fallback card with the raw payload instead of throwing. */
      body = <pre className="showview-fallback">{JSON.stringify(frame.payload)}</pre>
      break
  }
  return (
    <section className="showview" data-context-tag={frame.contextTag} data-view={frame.view}>
      <h3 className="showview-title">{frame.title}</h3>
      {body}
    </section>
  )
}

/** Memoized: show frames arrive on a live WS and re-render with unrelated state. */
export const ShowView = memo(ShowViewComponent)
