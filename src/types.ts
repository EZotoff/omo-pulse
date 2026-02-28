/**
 * Shared TypeScript types for ez-omo-dash multi-project dashboard.
 * All types are self-contained with no external package dependencies.
 */

/** Source registry entry representing a single project source */
export type SourceRegistryEntry = {
  id: string
  projectRoot: string
  label?: string
  createdAt: number
  updatedAt: number
}

/** Session status from MainSessionView */
export type SessionStatus = "busy" | "idle" | "thinking" | "running_tool" | "unknown"

/** Plan status based on progress */
export type PlanStatus = "not started" | "in progress" | "complete"

/** Single step in a plan */
export type PlanStep = {
  checked: boolean
  text: string
}

/** Time series data for a single series (e.g., token usage, tool calls) */
export type TimeSeriesSeries = {
  id: string
  label: string
  tone: "muted" | "teal" | "red" | "green"
  values: number[]
}

/** Time series payload with multiple series and metadata */
export type TimeSeriesPayload = {
  windowMs: number
  bucketMs: number
  buckets: number
  anchorMs: number
  serverNowMs: number
  series: TimeSeriesSeries[]
}

/** Single session's contribution to time series data */
export type SessionTimeSeriesEntry = {
  sessionId: string
  sessionLabel: string
  isBackground: boolean
  values: number[]
}

/** Time series payload with per-session breakdown */
export type SessionTimeSeriesPayload = {
  windowMs: number
  bucketMs: number
  buckets: number
  anchorMs: number
  serverNowMs: number
  sessions: SessionTimeSeriesEntry[]
}

/** Summary of a background task for dashboard display */
export type BackgroundTaskSummary = {
  taskId: string
  sessionId: string
  status: string
  agent: string
  model: string | null
  currentTool: string
  lastUpdated: string
}

/** Token usage summary */
export type TokenUsageSummary = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Snapshot of a single project's state at a point in time */
export type ProjectSnapshot = {
  sourceId: string
  label: string
  projectRoot: string
  mainSession: {
    agent: string
    currentModel: string | null
    currentTool: string
    lastUpdated: string
    sessionLabel: string
    sessionId: string | null
    status: SessionStatus
  }
  planProgress: {
    name: string
    completed: number
    total: number
    path: string
    status: PlanStatus
    steps: PlanStep[]
  }
  timeSeries: TimeSeriesPayload
  backgroundTasks: BackgroundTaskSummary[]
  sessionTimeSeries: SessionTimeSeriesPayload
  tokenUsage?: TokenUsageSummary
  lastUpdatedMs: number
}

/** Multi-project dashboard payload combining all project snapshots */
export type DashboardMultiProjectPayload = {
  projects: ProjectSnapshot[]
  serverNowMs: number
  pollIntervalMs: number
}
