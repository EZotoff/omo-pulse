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
export type SessionStatus = "busy" | "idle" | "thinking" | "running_tool" | "bg_agent" | "question" | "plan_complete" | "error" | "unknown"

export type CanonicalAgent = "sisyphus" | "prometheus" | "atlas" | "other"

/** Plan status based on progress */
export type PlanStatus = "not started" | "in progress" | "complete"

/** Single step in a plan */
export type PlanStep = {
  checked: boolean
  text: string
}

/** Uninitiated plan (zero-completion state) */
export type UninitiatedPlan = {
  name: string
  path: string
  total: number
  steps: PlanStep[]
}

/** Boulder state representing an active or completed plan */
export type BoulderState = {
  active_plan: string
  started_at: string
  session_ids: string[]
  plan_name: string
  status?: "active" | "completed"
  completed_at?: string
}

/** Historical entry for a completed plan */
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

/** Archived plan reference */
export type ArchivedPlan = {
  name: string
  path: string
  archivedAt: string
}

/** Plan completion history */
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

/** Summary of a single included session */
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

/** Token usage summary */
export type TokenUsageSummary = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type WorktreeSummary = {
  path: string
  branch: string | null
  commitHash: string
  isMainWorktree: boolean
  isLocked: boolean
  isPrunable: boolean
  commitsAhead: number
  diffStat: {
    filesChanged: number
    insertions: number
    deletions: number
  } | null
}

export type WorktreeInfo = {
  totalCount: number
  activeCount: number
  hotCount: number
  worktrees: WorktreeSummary[]
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
    boulderStatus?: "active" | "completed"
    completedAt?: string
  }
  unintiatedPlans: UninitiatedPlan[]
  planHistory?: PlanHistory
  timeSeries: TimeSeriesPayload
  backgroundTasks: BackgroundTaskSummary[]
  sessionTimeSeries: SessionTimeSeriesPayload
  tokenUsage?: TokenUsageSummary
  /** Uncommitted git changes count (staged + unstaged + untracked). undefined = not available */
  gitUncommittedCount?: number
  worktrees?: WorktreeInfo
  lastUpdatedMs: number
  /** Most recent session activity across all sessions (ms epoch). undefined = not available */
  lastActivityMs?: number
}

/** Multi-project dashboard payload combining all project snapshots */
export type DashboardMultiProjectPayload = {
  projects: ProjectSnapshot[]
  /** All discovered non-transient projects (uncapped, snapshot stubs) — for the Projects management menu */
  discoveredProjects?: ProjectSnapshot[]
  serverNowMs: number
  pollIntervalMs: number
}

/** Configuration state for strip visibility options */
/** Sparkline rendering mode in the collapsed strip header */
export type MiniSparklineMode = "ambient" | "inline" | "off"

export type StripConfigState = {
  miniSparklineMode: MiniSparklineMode
  showPlanProgress: boolean
  showAgentBadge: boolean
  showLastUpdated: boolean
  showStatusDot: boolean
  showTokenUsage: boolean
  showBackgroundTasks: boolean
  showGitWorktrees: boolean
  showAvatar: boolean
  showProjectName: boolean
  /** Provider quota strip visibility (dashboard header area) */
  showQuotas: boolean
  /** Provider quota strip identifier style: fetched favicons or letter codes */
  quotaIconMode: "icons" | "codes"
  stripDisplayMode: "project" | "session"
  /** How many recently-active projects to show on the dashboard (auto mode) */
  recentProjectsLimit: number
  /** How the dashboard project list is populated: top-X recent activity or manual pins */
  projectListMode: "recent" | "manual"
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
  isManualOrder: boolean
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

/** Single quota window for a provider (e.g. 5-hour rolling, weekly, monthly) */
export type QuotaWindow = {
  /** Stable window id: "5h" | "weekly" | "monthly" */
  id: string
  /** Micro label shown next to the usage line: "5H", "WK", "MO" */
  shortLabel: string
  /** Human label for tooltips: "5-hour rolling" */
  label: string
  /** 0..100 percent used */
  usedPercent: number
  /** Next reset as epoch ms, null when the provider does not report one */
  resetsAtMs: number | null
}

/** Quota state for a single provider */
export type ProviderQuota = {
  providerId: string
  name: string
  /** 1-2 char monogram shown in the strip (fallback when no icon) */
  symbol: string
  /** Provider favicon as a data URI, null when unavailable */
  icon: string | null
  windows: QuotaWindow[]
  status: "ok" | "unconfigured" | "error"
  error?: string
  fetchedAtMs: number
}

/** Payload for GET /api/quotas */
export type ProviderQuotasPayload = {
  providers: ProviderQuota[]
  serverNowMs: number
}

/** Attention state for a session */
export type AttentionState = "question" | "error" | "awaiting_input" | "plan_complete" | "working"

/** Attention session needing user action */
export type AttentionSession = {
  sessionId: string
  sessionLabel: string
  state: AttentionState
  waitMs: number
}

/** Project attention summary */
export type AttentionProject = {
  sourceId: string
  label: string
  projectRoot: string
  next: AttentionSession | null
  queue: number
  busySessions: number
  totalSessions: number
}

/** Payload for GET /api/attention */
export type AttentionPayload = {
  projects: AttentionProject[]
  serverNowMs: number
}
