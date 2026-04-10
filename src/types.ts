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
export type SessionStatus = "busy" | "idle" | "thinking" | "running_tool" | "question" | "plan_complete" | "error" | "unknown"

/** Plan status based on progress */
export type PlanStatus = "not started" | "in progress" | "complete"

/** Single step in a plan */
export type PlanStep = {
  checked: boolean
  text: string
}

/** Uninitiated plan (zero-completion state) */
export type UnintiatedPlan = {
  name: string
  path: string
  total: number
  steps: PlanStep[]
}

export type BoulderState = {
  active_plan: string
  started_at: string
  session_ids: string[]
  plan_name: string
  status?: string
  completed_at?: string
}

export type BoulderHistoryEntry = {
  plan_name: string
  plan_path: string
  archived_path: string
  started_at: string
  completed_at: string
  session_ids: string[]
  total_tasks: number
  completed_tasks: number
  agent?: string
}

export type PlanHistory = {
  entries: BoulderHistoryEntry[]
  totalCompleted: number
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

export type SessionSummary = {
  sessionId: string
  sessionLabel: string
  agent: string
  status: SessionStatus
  currentModel: string
  currentTool: string
  lastUpdated: string
  lastUpdatedMs: number
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

/** Summary of a single git worktree */
export type WorktreeSummary = {
  path: string
  branch: string | null
  commitHash: string
  isMainWorktree: boolean
  commitsAhead: number
  diffStat: { filesChanged: number; insertions: number; deletions: number } | null
  isLocked: boolean
  isPrunable: boolean
}

/** Aggregated git worktree information */
export type WorktreeInfo = {
  totalCount: number
  activeCount: number
  hotCount: number
  worktrees: WorktreeSummary[]
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
  sessions: SessionSummary[]
  aggregateStatus: SessionStatus
  planProgress: {
    name: string
    completed: number
    total: number
    path: string
    status: PlanStatus
    steps: PlanStep[]
    planStale: boolean
    planComplete: boolean
    boulderStatus?: string
    completedAt?: string
  }
  unintiatedPlans: UnintiatedPlan[]
  planHistory?: PlanHistory
  timeSeries: TimeSeriesPayload
  backgroundTasks: BackgroundTaskSummary[]
  sessionTimeSeries: SessionTimeSeriesPayload
   tokenUsage?: TokenUsageSummary
   /** Uncommitted git changes count (staged + unstaged + untracked). undefined = not available */
   gitUncommittedCount?: number
   worktrees?: WorktreeInfo
   lastUpdatedMs: number
}

/** Multi-project dashboard payload combining all project snapshots */
export type DashboardMultiProjectPayload = {
  projects: ProjectSnapshot[]
  serverNowMs: number
  pollIntervalMs: number
}

/** Configuration state for strip visibility options */
export type StripConfigState = {
  showMiniSparkline: boolean
  showPlanProgress: boolean
  showAgentBadge: boolean
  showLastUpdated: boolean
  showStatusDot: boolean
  showTokenUsage: boolean
  showBackgroundTasks: boolean
  showGitWorktrees: boolean
  showAvatar: boolean
  showProjectName: boolean
  stripDisplayMode: "project" | "session"
}

/** Sound notification configuration */
export type SoundConfig = {
  enabled: boolean
  volume: number
  onSessionIdle: boolean
  onPlanComplete: boolean
  onSessionError: boolean
  onQuestion: boolean
}

/** Project ordering and layout state */
export type ProjectOrderState = {
  orderedIds: string[]
  columns: number
}

/** Per-project visibility configuration */
export type VisibilityConfig = Record<string, boolean>

/** Telegram notification service configuration */
export type TelegramServiceConfig = {
  botToken: string
  chatId: string
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number
  /** Debounce interval for edits in ms (default: 3000) */
  debounceMs?: number
}

/** Telegram notification service runtime status */
export type TelegramServiceStatus = {
  enabled: boolean
  pinnedMessageId: number | null
  lastUpdateMs: number | null
  lastError: string | null
  alertsSent: number
}
