import type { ProjectSnapshot } from "../../types"

/**
 * Filter projects by a search query.
 * Performs case-insensitive substring matching against label and projectRoot.
 * Empty or whitespace-only query returns all projects unchanged.
 */
export function filterProjects(
  projects: ProjectSnapshot[],
  query: string
): ProjectSnapshot[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return projects
  }

  const lowerQuery = trimmed.toLowerCase()

  return projects.filter((project) => {
    const labelMatch = project.label.toLowerCase().includes(lowerQuery)
    const pathMatch = project.projectRoot.toLowerCase().includes(lowerQuery)
    return labelMatch || pathMatch
  })
}
