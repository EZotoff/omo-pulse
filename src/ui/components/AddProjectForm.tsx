import { useCallback, useEffect, useRef, useState } from "react"
import "./AddProjectForm.css"

/* ── Props ── */

export type AddProjectFormProps = {
  onProjectAdded?: () => void
}

/* ── Component ── */

export function AddProjectForm({ onProjectAdded }: AddProjectFormProps) {
  const [projectRoot, setProjectRoot] = useState("")
  const [label, setLabel] = useState("")
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null)
  const [fading, setFading] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Clear fade timer on unmount */
  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [])

  const showStatus = useCallback((message: string, type: "success" | "error") => {
    setStatusMessage(message)
    setStatusType(type)
    setFading(false)
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => setFading(true), 3_000)
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      /* Validate */
      if (!projectRoot.trim()) {
        showStatus("Project root path is required", "error")
        return
      }

      setLoading(true)
      try {
        const res = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectRoot: projectRoot.trim(), label: label.trim() || undefined }),
        })
        const data = await res.json()

        if (data.ok) {
          setProjectRoot("")
          setLabel("")
          showStatus("Project added successfully", "success")
          onProjectAdded?.()
        } else {
          showStatus(data.error ?? "Failed to add project", "error")
        }
      } catch {
        showStatus("Network error — could not reach server", "error")
      } finally {
        setLoading(false)
      }
    },
    [projectRoot, label, onProjectAdded, showStatus],
  )

  return (
    <form className="add-project-form" onSubmit={handleSubmit}>
      <input
        className={`add-project-input add-project-input--path${statusType === "error" && !projectRoot.trim() ? " add-project-input--error" : ""}`}
        type="text"
        name="projectRoot"
        placeholder="/path/to/project"
        value={projectRoot}
        onChange={(e) => setProjectRoot(e.target.value)}
        disabled={loading}
        autoComplete="off"
        spellCheck={false}
      />
      <input
        className="add-project-input add-project-input--label"
        type="text"
        name="label"
        placeholder="Project label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={loading}
        autoComplete="off"
      />
      <button className="add-project-submit" type="submit" disabled={loading}>
        {loading ? "Adding…" : "+ Add"}
      </button>

      {statusMessage && (
        <span
          className={`add-project-status add-project-status--${statusType}${fading ? " add-project-status--fade" : ""}`}
          role="status"
        >
          {statusMessage}
        </span>
      )}
    </form>
  )
}
