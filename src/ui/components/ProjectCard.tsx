import { useState, useRef, useEffect, useCallback } from "react"
import type React from "react"
import { formatRelativeTime } from "./ProjectStrip"
import type { ProjectSnapshot } from "../../types"
import "./ProjectCard.css"

export type ProjectCardProps = {
  project: ProjectSnapshot
  isVisible: boolean
  onToggleVisibility: (sourceId: string) => void
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  onRefresh?: () => void | Promise<void>
}

export function ProjectCard({
  project,
  isVisible,
  onToggleVisibility,
  dragHandleProps,
  onRefresh
}: ProjectCardProps) {
  const fallbackLabel = project.projectRoot.split("/").filter(Boolean).pop() || "unknown"
  const label = project.label || fallbackLabel
  const activeAgent = project.mainSession?.agent
  const isActive = project.aggregateStatus !== "idle" && project.aggregateStatus !== "unknown"
  const showAgent = activeAgent && isActive
  const sessionCount = project.sessions.length

  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(label)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) {
      setEditLabel(label)
    }
  }, [isEditing, label])

  const handleSave = useCallback(async () => {
    if (!editLabel.trim() || editLabel === label) {
      setIsEditing(false)
      return
    }
    
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/sources/${project.sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim() })
      })
      if (res.ok) {
        setIsEditing(false)
        onRefresh?.()
      }
    } catch (e) {
      console.error("Failed to rename project", e)
    } finally {
      setIsSubmitting(false)
    }
  }, [editLabel, label, project.sourceId, onRefresh])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      setIsEditing(false)
      setEditLabel(label)
    }
  }, [handleSave, label])

  const handleRemove = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/sources/${project.sourceId}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onRefresh?.()
      }
    } catch (e) {
      console.error("Failed to remove project", e)
    } finally {
      setIsSubmitting(false)
    }
  }, [project.sourceId, onRefresh])


  return (
    <div className="project-card">
      <div 
        className="project-card__drag-handle" 
        {...dragHandleProps}
      >
        ⠿
      </div>
      
      <div className="project-card__info">
        {isEditing ? (
          <div className="project-card__edit-form">
            <input
              ref={inputRef}
              type="text"
              className="project-card__edit-input"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              aria-label="Edit project name"
            />
            <div className="project-card__edit-actions">
              <button
                type="button"
                className="project-card__btn project-card__btn--save"
                onClick={handleSave}
                disabled={isSubmitting}
                aria-label="Save project name"
              >
                Save
              </button>
              <button
                type="button"
                className="project-card__btn project-card__btn--cancel"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
                aria-label="Cancel editing"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : isRemoving ? (
          <div className="project-card__remove-form">
            <span className="project-card__remove-text">Remove project?</span>
            <div className="project-card__edit-actions">
              <button
                type="button"
                className="project-card__btn project-card__btn--danger"
                onClick={handleRemove}
                disabled={isSubmitting}
                aria-label="Confirm remove project"
              >
                Remove
              </button>
              <button
                type="button"
                className="project-card__btn project-card__btn--cancel"
                onClick={() => setIsRemoving(false)}
                disabled={isSubmitting}
                aria-label="Cancel remove project"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="project-card__header">
              <span 
                className="strip-status-dot project-card__status" 
                data-status={project.aggregateStatus} 
                aria-hidden="true" 
              />
              <span className="project-card__label" title={project.projectRoot}>
                {label}
              </span>
              <span className="project-card__path" title={project.projectRoot}>
                {project.projectRoot}
              </span>
            </div>
            
            <div className="project-card__meta">
              <span className="project-card__time">
                {formatRelativeTime(project.lastUpdatedMs)}
              </span>
              <span className="project-card__bullet" aria-hidden="true">&bull;</span>
              <span className="project-card__sessions">
                {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
              </span>
              {showAgent && (
                <>
                  <span className="project-card__bullet" aria-hidden="true">&bull;</span>
                  <span className="project-card__agent">
                    {activeAgent}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>
      
      {!isEditing && !isRemoving && (
        <div className="project-card__actions">
          <button
            type="button"
            className="project-card__icon-btn"
            onClick={() => setIsEditing(true)}
            aria-label={`Edit project ${label}`}
            title="Edit"
          >
            ✎
          </button>
          <button
            type="button"
            className="project-card__icon-btn project-card__icon-btn--danger"
            onClick={() => setIsRemoving(true)}
            aria-label={`Remove project ${label}`}
            title="Remove"
          >
            ×
          </button>
          <button
            className="settings-switch project-card__toggle"
            data-checked={isVisible}
            onClick={() => onToggleVisibility(project.sourceId)}
            type="button"
            role="switch"
            aria-checked={isVisible}
            aria-label={`Toggle visibility for ${label}`}
          />
        </div>
      )}
    </div>
  )
}
