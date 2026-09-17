import { useState, useMemo, useEffect, useCallback } from "react"
import type { CSSProperties, HTMLAttributes } from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { OverlayShell } from "./OverlayShell"
import { ProjectCard } from "./ProjectCard"
import { AddProjectForm } from "./AddProjectForm"
import { filterProjects } from "../utils/projectSearch"
import type { ProjectSnapshot, VisibilityConfig } from "../../types"
import "./ProjectManagementPanel.css"

export type ProjectManagementPanelProps = {
  open: boolean
  onClose: () => void
  projects: ProjectSnapshot[]
  orderedIds: string[]
  visibility: VisibilityConfig
  onToggleVisibility: (sourceId: string) => void
  onReorder: (oldIndex: number, newIndex: number) => void
  onProjectAdded?: () => void
  onOpenSettings?: () => void
  onRefresh?: () => void
}

type SortableProjectCardProps = {
  id: string
  project: ProjectSnapshot
  isVisible: boolean
  dragDisabled: boolean
  onToggleVisibility: (sourceId: string) => void
  onRefresh?: () => void
}

function resolveOrderedProjectIds(projects: ProjectSnapshot[], orderedIds: string[]): string[] {
  const currentIds = projects.map((project) => project.sourceId)
  const retained = orderedIds.filter((id) => currentIds.includes(id))
  const added = currentIds.filter((id) => !orderedIds.includes(id))
  return [...retained, ...added]
}

function SortableProjectCard({
  id,
  project,
  isVisible,
  dragDisabled,
  onToggleVisibility,
  onRefresh,
}: SortableProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    disabled: dragDisabled,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const dragHandleProps: HTMLAttributes<HTMLDivElement> | undefined = dragDisabled
    ? undefined
    : { ...attributes, ...listeners }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="project-management-panel__card-wrapper"
      data-hidden={!isVisible}
      data-drag-disabled={dragDisabled}
    >
      <ProjectCard
        project={project}
        isVisible={isVisible}
        onToggleVisibility={onToggleVisibility}
        dragHandleProps={dragHandleProps}
        onRefresh={onRefresh}
      />
    </div>
  )
}

export function ProjectManagementPanel({
  open,
  onClose,
  projects,
  orderedIds,
  visibility,
  onToggleVisibility,
  onReorder,
  onProjectAdded,
  onOpenSettings,
  onRefresh,
}: ProjectManagementPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const isSearchActive = searchQuery.trim().length > 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  useEffect(() => {
    if (!open) {
      setSearchQuery("")
    }
  }, [open])

  const orderedProjects = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.sourceId, project]))
    return resolveOrderedProjectIds(projects, orderedIds)
      .map((id) => projectMap.get(id))
      .filter((project): project is ProjectSnapshot => project !== undefined)
  }, [projects, orderedIds])

  const filteredProjects = useMemo(() => {
    return filterProjects(orderedProjects, searchQuery)
  }, [orderedProjects, searchQuery])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (isSearchActive) return

      const { active, over } = event
      if (!over || active.id === over.id) return

      const currentIds = filteredProjects.map((project) => project.sourceId)
      const oldIndex = currentIds.indexOf(String(active.id))
      const newIndex = currentIds.indexOf(String(over.id))

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex)
      }
    },
    [filteredProjects, isSearchActive, onReorder]
  )

  return (
    <OverlayShell open={open} onClose={onClose} ariaLabel="Project Management">
      <div className="project-management-panel">
        <div className="project-management-panel__header">
          <h2 className="project-management-panel__title">
            Project Management
            <span className="project-management-panel__badge">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </span>
          </h2>
        </div>

        <div className="project-management-panel__body">
          <div className="project-management-panel__controls">
            <input
              type="text"
              className="project-management-panel__search"
              placeholder="Search projects…"
              aria-label="Search projects"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="project-management-panel__add-form">
              <AddProjectForm onProjectAdded={onProjectAdded} />
            </div>
          </div>

          <div className="project-management-panel__content">
            {projects.length === 0 ? (
              <div className="project-management-panel__empty">
                No projects registered — add one above
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="project-management-panel__empty">
                No projects match your search
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredProjects.map((project) => project.sourceId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    className="project-management-panel__grid"
                    data-search-active={isSearchActive}
                  >
                    {filteredProjects.map((project) => {
                      const isVisible = visibility[project.sourceId] !== false
                      return (
                        <SortableProjectCard
                          key={project.sourceId}
                          id={project.sourceId}
                          project={project}
                          isVisible={isVisible}
                          dragDisabled={isSearchActive}
                          onToggleVisibility={onToggleVisibility}
                          onRefresh={onRefresh}
                        />
                      )
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <div className="project-management-panel__footer">
          <button
            type="button"
            className="project-management-panel__settings-link"
            onClick={onOpenSettings}
          >
            Open Settings &rarr;
          </button>
        </div>
      </div>
    </OverlayShell>
  )
}
