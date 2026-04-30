/** Agent colour tone — used by Sparkline */
export type AgentTone = "teal" | "red" | "green" | "sand"

export type PreviewMode =
  | { kind: "attention-colors" }
  | { kind: "all-statuses" }
  | { kind: "status"; statusName: PreviewStatusName }

export const PREVIEW_STATUS_NAMES = ["question", "busy", "tool", "thinking", "idle", "unknown", "danger", "plan-complete"] as const

export type PreviewStatusName = (typeof PREVIEW_STATUS_NAMES)[number]

export function isPreviewStatusName(value: string): value is PreviewStatusName {
  return PREVIEW_STATUS_NAMES.includes(value as PreviewStatusName)
}

export function parsePreviewMode(search: string): PreviewMode | null {
  if (!search) return null
  const params = new URLSearchParams(search)
  const previewVal = params.get("preview")
  if (!previewVal) return null

  if (previewVal === "attention-colors") {
    return { kind: "attention-colors" }
  }

  if (previewVal === "all-statuses") {
    return { kind: "all-statuses" }
  }

  if (previewVal.startsWith("status:")) {
    const statusName = previewVal.slice(7)
    if (isPreviewStatusName(statusName)) {
      return { kind: "status", statusName }
    }
  }

  return null
}
