import { PREVIEW_STATUS_NAMES, type PreviewMode } from "../types"
import "./PreviewNav.css"

const STATUS_ORDER = PREVIEW_STATUS_NAMES

export function PreviewNav({ previewMode }: { previewMode: PreviewMode }) {
  if (previewMode.kind === 'attention-colors') return null

  if (previewMode.kind === 'all-statuses') {
    return (
      <div className="preview-nav" style={{ flexDirection: 'column', gap: 'var(--sp-1)' }}>
        <h2 className="preview-nav-title">Status Preview</h2>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>All Status Colors</span>
      </div>
    )
  }

  if (previewMode.kind === 'status') {
    const currentIndex = STATUS_ORDER.indexOf(previewMode.statusName)
    const prevStatus = STATUS_ORDER[(currentIndex - 1 + STATUS_ORDER.length) % STATUS_ORDER.length]
    const nextStatus = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length]

    return (
      <div className="preview-nav">
        <a href="?preview=all-statuses" className="preview-nav-back">
          &larr; All Statuses
        </a>
        
        <div className="preview-nav-center">
          <a href={`?preview=status:${prevStatus}`} className="preview-nav-arrow" aria-label="Previous Status">
            &#9664;
          </a>
          <h2 className="preview-nav-title">Status: {previewMode.statusName}</h2>
          <a href={`?preview=status:${nextStatus}`} className="preview-nav-arrow" aria-label="Next Status">
            &#9654;
          </a>
        </div>
      </div>
    )
  }

  return null
}
