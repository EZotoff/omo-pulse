import { useState, useEffect, useRef, useCallback } from "react"
import type {
  DashboardMultiProjectPayload,
  ProjectSnapshot,
  SessionTimeSeriesEntry,
  TimeSeriesSeries,
  SessionStatus,
} from "../../types"
import { PREVIEW_STATUS_NAMES, type PreviewMode, type PreviewStatusName } from "../types"

const POLL_CONNECTED_MS = 2200
const POLL_DISCONNECTED_MS = 3600
const PREVIEW_BUCKETS = 48
const PREVIEW_WINDOW_MS = 12 * 60 * 1000

type AttentionCandidate = {
  sourceId: string
  name: string
  hex: string
  border: string
}

type PreviewSession = ProjectSnapshot["mainSession"] & {
  lastUpdatedMs: number
}

const ATTENTION_CANDIDATES: AttentionCandidate[] = [
  { sourceId: "preview-amethyst", name: "Amethyst", hex: "#6b3ce2", border: "rgba(107, 60, 226, 0.72)" },
  { sourceId: "preview-deep-iris", name: "Deep Iris", hex: "#5a43e4", border: "rgba(90, 67, 228, 0.72)" },
  { sourceId: "preview-slate-purple", name: "Slate Purple", hex: "#7e22ce", border: "rgba(126, 34, 206, 0.72)" },
  { sourceId: "preview-cool-indigo", name: "Cool Indigo", hex: "#4f46e5", border: "rgba(79, 70, 229, 0.72)" },
]

type VariantConfig = {
  label?: string;
  stripCss?: string;
  dotCss?: string;
  dotAfterCss?: string;
  beforeCss?: string;
  afterCss?: string;
};

const STATUS_VARIANTS: Record<PreviewStatusName, VariantConfig[]> = {
  "question": [
    {},
    {
      "label": "Radiant Glass Purple",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(192, 132, 252, 0.6) 0%, rgba(168, 85, 247, 0.2) 100%) !important; backdrop-filter: blur(6px) !important; border: 1px solid rgba(216, 180, 254, 0.9) !important; box-shadow: 0 0 16px rgba(168, 85, 247, 0.8), inset 0 0 8px rgba(255, 255, 255, 0.5) !important;"
    }
  ],
  "busy": [
    {},
    {
      "label": "Lit Glass Cyan",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(6, 182, 212, 0.4) 0%, rgba(6, 182, 212, 0.1) 100%) !important; backdrop-filter: blur(4px) !important; border: 1px solid rgba(6, 182, 212, 0.8) !important; box-shadow: 0 0 10px rgba(6, 182, 212, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.3) !important;"
    }
  ],
  "tool": [
    {},
    {
      "label": "Lit Glass Blue",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(2, 132, 199, 0.4) 0%, rgba(2, 132, 199, 0.1) 100%) !important; backdrop-filter: blur(4px) !important; border: 1px solid rgba(2, 132, 199, 0.8) !important; box-shadow: 0 0 10px rgba(2, 132, 199, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.3) !important;"
    }
  ],
  "thinking": [
    {},
    {
      "label": "Lit Glass Sky",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(14, 165, 233, 0.4) 0%, rgba(14, 165, 233, 0.1) 100%) !important; backdrop-filter: blur(4px) !important; border: 1px solid rgba(14, 165, 233, 0.8) !important; box-shadow: 0 0 10px rgba(14, 165, 233, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.3) !important;"
    }
  ],
  "idle": [
    {},
    {
      "label": "Lit Glass Slate",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(148, 163, 184, 0.4) 0%, rgba(148, 163, 184, 0.1) 100%) !important; backdrop-filter: blur(4px) !important; border: 1px solid rgba(148, 163, 184, 0.8) !important; box-shadow: 0 0 10px rgba(148, 163, 184, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.3) !important;"
    }
  ],
  "unknown": [
    {},
    {
      "label": "Lit Glass Gray",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(100, 116, 139, 0.4) 0%, rgba(100, 116, 139, 0.1) 100%) !important; backdrop-filter: blur(4px) !important; border: 1px dashed rgba(100, 116, 139, 0.6) !important; box-shadow: 0 0 10px rgba(100, 116, 139, 0.3), inset 0 0 4px rgba(255, 255, 255, 0.1) !important;"
    }
  ],
  "danger": [
    {},
    {
      "label": "Lit Glass Crimson",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(239, 68, 68, 0.4) 0%, rgba(239, 68, 68, 0.1) 100%) !important; backdrop-filter: blur(4px) !important; border: 1px solid rgba(239, 68, 68, 0.8) !important; box-shadow: 0 0 10px rgba(239, 68, 68, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.3) !important;"
    }
  ],
  "plan-complete": [
    {},
    {
      "label": "Radiant Glass Emerald",
      "dotCss": "background: radial-gradient(circle at 30% 30%, rgba(52, 211, 153, 0.6) 0%, rgba(16, 185, 129, 0.2) 100%) !important; backdrop-filter: blur(6px) !important; border: 1px solid rgba(110, 231, 183, 0.9) !important; box-shadow: 0 0 16px rgba(16, 185, 129, 0.8), inset 0 0 8px rgba(255, 255, 255, 0.5) !important;"
    }
  ]
};
function buildStatusVariantStyles(statusPublicName: PreviewStatusName): string {
  const variants = STATUS_VARIANTS[statusPublicName];
  if (!variants) return "";

  return variants.map((variant, index) => {
    const sourceId = `preview-status-${statusPublicName}-${index}`;
    let css = "";
    if (variant.stripCss) {
      css += `\n.project-strip[data-project-id="${sourceId}"] { ${variant.stripCss} }`;
    }
    if (variant.dotCss) {
      css += `\n.project-strip[data-project-id="${sourceId}"] .strip-status-dot { ${variant.dotCss} }`;
    }
    if (variant.dotAfterCss) {
      css += `\n.project-strip[data-project-id="${sourceId}"] .strip-status-dot::after { ${variant.dotAfterCss} }`;
    }
    if (variant.beforeCss) {
      css += `\n.project-strip[data-project-id="${sourceId}"]::before { ${variant.beforeCss} }`;
    }
    if (variant.afterCss) {
      css += `\n.project-strip[data-project-id="${sourceId}"]::after { ${variant.afterCss} }`;
    }
    return css;
  }).join("\n");
}

const PUBLIC_STATUS_ORDER = PREVIEW_STATUS_NAMES

function publicNameToInternalStatus(publicName: PreviewStatusName): SessionStatus {
  const mapping: Record<PreviewStatusName, SessionStatus> = {
    "question": "question",
    "busy": "busy",
    "tool": "running_tool",
    "thinking": "thinking",
    "idle": "idle",
    "unknown": "unknown",
    "danger": "error",
    "plan-complete": "plan_complete",
  }
  return mapping[publicName]
}

function buildWave(args: { base: number; variance: number; phase: number }): number[] {
  const { base, variance, phase } = args
  return Array.from({ length: PREVIEW_BUCKETS }, (_, index) => {
    const primary = Math.sin((index + phase) / 4.8) * variance
    const secondary = Math.cos((index + phase) / 7.2) * variance * 0.45
    return Math.max(0, Math.round(base + primary + secondary))
  })
}

function createPreviewSeries(index: number): TimeSeriesSeries[] {
  return [
    {
      id: `preview-series-${index}`,
      label: "Question trace",
      tone: "teal",
      values: buildWave({ base: 78 - index * 4, variance: 18 - index, phase: index * 2 }),
    },
  ]
}

function createPreviewSwimlane(index: number): SessionTimeSeriesEntry[] {
  return [
    {
      sessionId: `preview-session-${index}`,
      sessionLabel: `question-${index + 1}`,
      isBackground: false,
      values: buildWave({ base: 6, variance: 2, phase: index * 3 }),
    },
  ]
}

function createPreviewSession(candidate: AttentionCandidate, nowMs: number): PreviewSession {
  return {
    sessionId: `${candidate.sourceId}-session`,
    sessionLabel: `question-${candidate.name.toLowerCase().replace(/\s+/g, "-")}`,
    agent: "atlas",
    status: "question",
    currentModel: "preview-model",
    currentTool: "ask_user_question",
    lastUpdated: new Date(nowMs).toISOString(),
    lastUpdatedMs: nowMs,
  }
}

function createPreviewProject(candidate: AttentionCandidate, index: number, nowMs: number): ProjectSnapshot {
  const session = createPreviewSession(candidate, nowMs - index * 1_500)
  return {
    sourceId: candidate.sourceId,
    label: `${candidate.name} · ${candidate.hex}`,
    projectRoot: `/preview/${candidate.sourceId}`,
    mainSession: {
      agent: session.agent,
      currentModel: session.currentModel,
      currentTool: session.currentTool,
      lastUpdated: session.lastUpdated,
      sessionLabel: session.sessionLabel,
      sessionId: session.sessionId,
      status: "question",
    },
    planProgress: {
      name: "Attention color preview",
      completed: 0,
      total: 3,
      path: `/preview/${candidate.sourceId}.md`,
      status: "in progress",
      steps: [
        { checked: true, text: "Border sheen" },
        { checked: false, text: "Question dot" },
        { checked: false, text: "Collapsed readability" },
      ],
      planStale: false,
      planComplete: false,
    },
    timeSeries: {
      windowMs: PREVIEW_WINDOW_MS,
      bucketMs: PREVIEW_WINDOW_MS / PREVIEW_BUCKETS,
      buckets: PREVIEW_BUCKETS,
      anchorMs: nowMs,
      serverNowMs: nowMs,
      series: createPreviewSeries(index),
    },
    sessions: [],
    aggregateStatus: "question" as const,
    unintiatedPlans: [],
    backgroundTasks: [],
    sessionTimeSeries: {
      windowMs: PREVIEW_WINDOW_MS,
      bucketMs: PREVIEW_WINDOW_MS / PREVIEW_BUCKETS,
      buckets: PREVIEW_BUCKETS,
      anchorMs: nowMs,
      serverNowMs: nowMs,
      sessions: createPreviewSwimlane(index),
    },
    tokenUsage: {
      inputTokens: 16_000 + index * 900,
      outputTokens: 4_200 + index * 320,
      totalTokens: 20_200 + index * 1_220,
    },
    gitUncommittedCount: 0,
    lastUpdatedMs: session.lastUpdatedMs,
  }
}

function createPreviewPayload(nowMs: number): DashboardMultiProjectPayload {
  return {
    projects: ATTENTION_CANDIDATES.map((candidate, index) => createPreviewProject(candidate, index, nowMs)),
    serverNowMs: nowMs,
    pollIntervalMs: POLL_CONNECTED_MS,
  }
}

function buildPreviewStyles(): string {
  return ATTENTION_CANDIDATES.map((candidate) => `
[data-project-id="${candidate.sourceId}"] {
  --status-question: ${candidate.hex};
  --status-question-border: ${candidate.border};
}
`).join("\n")
}

function createAllStatusesProject(publicName: PreviewStatusName, index: number, nowMs: number): ProjectSnapshot {
  const internalStatus = publicNameToInternalStatus(publicName)

  const session: PreviewSession = {
    sessionId: `preview-all-${publicName}-${index}`,
    sessionLabel: `${publicName}-status`,
    agent: "atlas",
    status: internalStatus,
    currentModel: "preview-model",
    currentTool: internalStatus === "running_tool" ? "example_tool" : "",
    lastUpdated: new Date(nowMs - index * 1_500).toISOString(),
    lastUpdatedMs: nowMs - index * 1_500,
  }

  return {
    sourceId: `preview-all-${publicName}-${index}`,
    label: publicName.charAt(0).toUpperCase() + publicName.slice(1),
    projectRoot: `/preview/all-statuses/${publicName}-${index}`,
    mainSession: {
      agent: session.agent,
      currentModel: session.currentModel,
      currentTool: session.currentTool,
      lastUpdated: session.lastUpdated,
      sessionLabel: session.sessionLabel,
      sessionId: session.sessionId,
      status: internalStatus,
    },
    planProgress: {
      name: `${publicName} preview`,
      completed: 0,
      total: 3,
      path: `/preview/all-statuses/${publicName}.md`,
      status: "in progress",
      steps: [
        { checked: true, text: "Status rendering" },
        { checked: false, text: "Color application" },
        { checked: false, text: "Interaction test" },
      ],
      planStale: false,
      planComplete: false,
    },
    timeSeries: {
      windowMs: PREVIEW_WINDOW_MS,
      bucketMs: PREVIEW_WINDOW_MS / PREVIEW_BUCKETS,
      buckets: PREVIEW_BUCKETS,
      anchorMs: nowMs,
      serverNowMs: nowMs,
      series: createPreviewSeries(index),
    },
    sessions: [],
    aggregateStatus: internalStatus,
    unintiatedPlans: [],
    backgroundTasks: [],
    sessionTimeSeries: {
      windowMs: PREVIEW_WINDOW_MS,
      bucketMs: PREVIEW_WINDOW_MS / PREVIEW_BUCKETS,
      buckets: PREVIEW_BUCKETS,
      anchorMs: nowMs,
      serverNowMs: nowMs,
      sessions: createPreviewSwimlane(index),
    },
    tokenUsage: {
      inputTokens: 10_000 + index * 500,
      outputTokens: 2_500 + index * 200,
      totalTokens: 12_500 + index * 700,
    },
    gitUncommittedCount: 0,
    lastUpdatedMs: session.lastUpdatedMs,
  }
}

function createAllStatusesPreviewPayload(nowMs: number): DashboardMultiProjectPayload {
  return {
    projects: PUBLIC_STATUS_ORDER.map((publicName, index) => createAllStatusesProject(publicName, index, nowMs)),
    serverNowMs: nowMs,
    pollIntervalMs: POLL_CONNECTED_MS,
  }
}

function createStatusVariantProject(statusPublicName: PreviewStatusName, variantIndex: number, nowMs: number): ProjectSnapshot {
  const internalStatus = publicNameToInternalStatus(statusPublicName)

  const isCurrentVariant = variantIndex === 0
  const variantConfig = STATUS_VARIANTS[statusPublicName]?.[variantIndex]
  const label = variantConfig?.label || (isCurrentVariant ? "Current" : `Variant ${variantIndex + 1}`)

  const session: PreviewSession = {
    sessionId: `preview-status-${statusPublicName}-${variantIndex}`,
    sessionLabel: label.toLowerCase().replace(/\s+/g, "-"),
    agent: "atlas",
    status: internalStatus,
    currentModel: "preview-model",
    currentTool: internalStatus === "running_tool" ? "example_tool" : "",
    lastUpdated: new Date(nowMs - variantIndex * 1_500).toISOString(),
    lastUpdatedMs: nowMs - variantIndex * 1_500,
  }

  return {
    sourceId: `preview-status-${statusPublicName}-${variantIndex}`,
    label: `${String.fromCharCode(65 + variantIndex)}Project`,
    projectRoot: `/preview/status/${statusPublicName}-${variantIndex}`,
    mainSession: {
      agent: session.agent,
      currentModel: session.currentModel,
      currentTool: session.currentTool,
      lastUpdated: session.lastUpdated,
      sessionLabel: session.sessionLabel,
      sessionId: session.sessionId,
      status: internalStatus,
    },
    planProgress: {
      name: `${statusPublicName} placeholder`,
      completed: 0,
      total: 3,
      path: `/preview/status/${statusPublicName}-${variantIndex}.md`,
      status: "in progress",
      steps: [
        { checked: true, text: "Placeholder created" },
        { checked: false, text: "Variant styling" },
        { checked: false, text: "Effects review" },
      ],
      planStale: false,
      planComplete: false,
    },
    timeSeries: {
      windowMs: PREVIEW_WINDOW_MS,
      bucketMs: PREVIEW_WINDOW_MS / PREVIEW_BUCKETS,
      buckets: PREVIEW_BUCKETS,
      anchorMs: nowMs,
      serverNowMs: nowMs,
      series: createPreviewSeries(variantIndex),
    },
    sessions: [],
    aggregateStatus: internalStatus,
    unintiatedPlans: [],
    backgroundTasks: [],
    sessionTimeSeries: {
      windowMs: PREVIEW_WINDOW_MS,
      bucketMs: PREVIEW_WINDOW_MS / PREVIEW_BUCKETS,
      buckets: PREVIEW_BUCKETS,
      anchorMs: nowMs,
      serverNowMs: nowMs,
      sessions: createPreviewSwimlane(variantIndex),
    },
    tokenUsage: {
      inputTokens: 8_000 + variantIndex * 300,
      outputTokens: 2_000 + variantIndex * 150,
      totalTokens: 10_000 + variantIndex * 450,
    },
    gitUncommittedCount: 0,
    lastUpdatedMs: session.lastUpdatedMs,
  }
}

function createSingleStatusPreviewPayload(statusPublicName: PreviewStatusName, nowMs: number): DashboardMultiProjectPayload {
  const projects: ProjectSnapshot[] = []
  const variants = STATUS_VARIANTS[statusPublicName] || []
  const count = variants.length
  for (let i = 0; i < count; i++) {
    projects.push(createStatusVariantProject(statusPublicName, i, nowMs))
  }
  return {
    projects,
    serverNowMs: nowMs,
    pollIntervalMs: POLL_CONNECTED_MS,
  }
}

export function useDashboardData(previewMode: PreviewMode | null = null): {
  data: DashboardMultiProjectPayload | null
  connected: boolean
  lastUpdate: number | null
  errorHint: string | null
  refresh: () => Promise<void>
} {
  const [data, setData] = useState<DashboardMultiProjectPayload | null>(() => {
    if (!previewMode) return null
    const nowMs = Date.now()
    if (previewMode.kind === "attention-colors") {
      return createPreviewPayload(nowMs)
    }
    if (previewMode.kind === "all-statuses") {
      return createAllStatusesPreviewPayload(nowMs)
    }
    if (previewMode.kind === "status") {
      return createSingleStatusPreviewPayload(previewMode.statusName, nowMs)
    }
    return null
  })
  const [connected, setConnected] = useState(!!previewMode)
  const [lastUpdate, setLastUpdate] = useState<number | null>(() => {
    return previewMode ? Date.now() : null
  })
  const [errorHint, setErrorHint] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const connectedRef = useRef(false)

  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  useEffect(() => {
    if (!previewMode || (previewMode.kind !== "attention-colors" && previewMode.kind !== "status")) return

    const styleId = "preview-styles"
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement("style")
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = previewMode.kind === "attention-colors" ? buildPreviewStyles() : (previewMode.kind === "status" ? buildStatusVariantStyles(previewMode.statusName) : "")

    return () => {
      style?.remove()
    }
  }, [previewMode])

  useEffect(() => {
    if (!previewMode) return

    const nowMs = Date.now()
    let payload: DashboardMultiProjectPayload | null = null

    if (previewMode.kind === "attention-colors") {
      payload = createPreviewPayload(nowMs)
    } else if (previewMode.kind === "all-statuses") {
      payload = createAllStatusesPreviewPayload(nowMs)
    } else if (previewMode.kind === "status") {
      payload = createSingleStatusPreviewPayload(previewMode.statusName, nowMs)
    }

    if (payload) {
      setData(payload)
      setConnected(true)
      connectedRef.current = true
      setLastUpdate(nowMs)
      setErrorHint(null)
    }
  }, [previewMode])

  const fetchNow = useCallback(async (ac: AbortController) => {
    try {
      const res = await fetch("/api/projects", { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw: DashboardMultiProjectPayload = await res.json()
      
      setData(raw)
      setConnected(true)
      connectedRef.current = true
      setLastUpdate(Date.now())
      setErrorHint(null)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      
      setConnected(false)
      connectedRef.current = false
      const message = err instanceof Error ? err.message : String(err)
      setErrorHint(message)
    }
  }, [])

  const tick = useCallback(async () => {
    if (previewMode) {
      const nowMs = Date.now()
      let payload: DashboardMultiProjectPayload | null = null

      if (previewMode.kind === "attention-colors") {
        payload = createPreviewPayload(nowMs)
      } else if (previewMode.kind === "all-statuses") {
        payload = createAllStatusesPreviewPayload(nowMs)
      } else if (previewMode.kind === "status") {
        payload = createSingleStatusPreviewPayload(previewMode.statusName, nowMs)
      }

      if (payload) {
        setData(payload)
        setConnected(true)
        connectedRef.current = true
        setLastUpdate(nowMs)
        setErrorHint(null)
      }
      const delay = POLL_CONNECTED_MS
      timerRef.current = setTimeout(tick, delay)
      return
    }

    const ac = new AbortController()
    abortRef.current = ac

    await fetchNow(ac)
    
    if (ac.signal.aborted) return

    const delay = connectedRef.current ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS
    timerRef.current = setTimeout(tick, delay)
  }, [fetchNow, previewMode])

  const refresh = useCallback(async () => {
    if (previewMode) {
      const nowMs = Date.now()
      let payload: DashboardMultiProjectPayload | null = null

      if (previewMode.kind === "attention-colors") {
        payload = createPreviewPayload(nowMs)
      } else if (previewMode.kind === "all-statuses") {
        payload = createAllStatusesPreviewPayload(nowMs)
      } else if (previewMode.kind === "status") {
        payload = createSingleStatusPreviewPayload(previewMode.statusName, nowMs)
      }

      if (payload) {
        setData(payload)
        setConnected(true)
        connectedRef.current = true
        setLastUpdate(nowMs)
        setErrorHint(null)
      }
      return
    }

    if (abortRef.current) abortRef.current.abort()
    if (timerRef.current !== null) clearTimeout(timerRef.current)

    const ac = new AbortController()
    abortRef.current = ac

    await fetchNow(ac)

    if (ac.signal.aborted) return

    const delay = connectedRef.current ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS
    timerRef.current = setTimeout(tick, delay)
  }, [fetchNow, previewMode, tick])

  useEffect(() => {
    tick()

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [tick])

  return { data, connected, lastUpdate, errorHint, refresh }
}
