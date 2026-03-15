/** Agent colour tone — shared across Sparkline & SessionSwimlane */
export type AgentTone = "teal" | "red" | "green" | "sand"

export type PreviewMode =
  | { kind: "attention-colors" }
  | { kind: "all-statuses" }
  | { kind: "status"; statusName: string }

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
    const validNames = ["question", "busy", "tool", "thinking", "idle", "unknown", "danger", "plan-complete"]
    if (validNames.includes(statusName)) {
      return { kind: "status", statusName }
    }
  }

  return null
}
