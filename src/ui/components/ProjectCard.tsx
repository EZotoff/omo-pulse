import type React from "react"
import { formatRelativeTime } from "./ProjectStrip"
import type { ProjectSnapshot } from "../../types"
import "./ProjectCard.css"

export type ProjectCardProps = {
  project: ProjectSnapshot
  isVisible: boolean
  onToggleVisibility: (sourceId: string) => void
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

export function ProjectCard({
  project,
  isVisible,
  onToggleVisibility,
  dragHandleProps
}: ProjectCardProps) {
  const fallbackLabel = project.projectRoot.split("/").filter(Boolean).pop() || "unknown"
  const label = project.label || fallbackLabel
  const activeAgent = project.mainSession?.agent
  const isActive = project.mainSession?.status !== "idle" && project.mainSession?.status !== "unknown"
  const showAgent = activeAgent && isActive
  const sessionCount = project.sessionTimeSeries?.sessions?.length ?? 0

  return (
    <div className="project-card">
      <div 
        className="project-card__drag-handle" 
        {...dragHandleProps}
      >
        ⠿
      </div>
      
      <div className="project-card__info">
        <div className="project-card__header">
          <span 
            className="strip-status-dot project-card__status" 
            data-status={project.mainSession?.status || 'unknown'} 
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
      </div>
      
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
  )
}
