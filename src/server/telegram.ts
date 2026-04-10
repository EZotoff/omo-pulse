import type {
  DashboardMultiProjectPayload,
  ProjectSnapshot,
  SessionStatus,
  TelegramServiceConfig,
  TelegramServiceStatus,
} from "../types"

const STATUS_EMOJI: Record<SessionStatus, string> = {
  busy: "🟢",
  running_tool: "🟢",
  thinking: "🟡",
  idle: "⚪",
  question: "❓",
  plan_complete: "✅",
  error: "🔴",
  unknown: "⚫",
}

const ALERT_STATUSES: ReadonlySet<SessionStatus> = new Set(["question", "error", "plan_complete"])

type TelegramApiResponse = {
  ok: boolean
  result?: { message_id: number }
  description?: string
  parameters?: { retry_after?: number }
}

type TelegramState = {
  pinnedMessageId: number | null
  prevSessionStatuses: Map<string, SessionStatus>
  alertedSessions: Set<string>
  lastEditMs: number
  lastMessageText: string
  alertsSent: number
  lastError: string | null
  isFirstPoll: boolean
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

function formatRelativeTime(diffMs: number): string {
  if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s ago`
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`
  return `${Math.round(diffMs / 3_600_000)}h ago`
}

export function formatStatusMessage(payload: DashboardMultiProjectPayload): string {
  const { projects, serverNowMs } = payload
  const totalSessions = projects.reduce((sum, p) => sum + Math.max(p.sessions.length, 1), 0)

  const lines: string[] = []
  lines.push(`<b>omo-pulse</b> · ${projects.length} project${projects.length !== 1 ? "s" : ""} · ${totalSessions} session${totalSessions !== 1 ? "s" : ""}`)
  lines.push("")

  for (const project of projects) {
    if (project.sessions.length === 0) {
      const emoji = STATUS_EMOJI[project.aggregateStatus]
      const label = escapeHtml(project.label)
      const tool =
        project.mainSession.currentTool && project.mainSession.currentTool !== "-"
          ? ` (${escapeHtml(project.mainSession.currentTool)})`
          : ""
      lines.push(`${emoji} <b>${label}</b>  ${project.aggregateStatus}${tool}`)
    } else {
      for (const session of project.sessions) {
        const emoji = STATUS_EMOJI[session.status]
        const label = escapeHtml(project.label)
        const sessionLabel = escapeHtml(session.sessionLabel)
        const tool =
          session.currentTool && session.currentTool !== "-"
            ? ` (${escapeHtml(session.currentTool)})`
            : ""
        const diffMs = serverNowMs - session.lastUpdatedMs
        const relative =
          session.status === "idle" && session.lastUpdatedMs > 0 && diffMs > 60_000
            ? ` ${formatRelativeTime(diffMs)}`
            : ""
        lines.push(`${emoji} <b>${label}</b>  ${sessionLabel}: ${session.status}${tool}${relative}`)
      }
    }
  }

  if (projects.length === 0) {
    lines.push("No projects registered")
  }

  lines.push("")
  lines.push(`🕐 ${formatTime(serverNowMs)} · updated just now`)

  return lines.join("\n")
}

function formatAlertMessage(project: ProjectSnapshot, sessionId: string, status: SessionStatus): string {
  const emoji = STATUS_EMOJI[status]
  const label = escapeHtml(project.label)
  const session = project.sessions.find((s) => s.sessionId === sessionId)
  const sessionLabel = session ? escapeHtml(session.sessionLabel) : sessionId

  if (status === "question") {
    return `${emoji} <b>${label}</b> · ${sessionLabel}\nAgent is waiting for your input`
  }
  if (status === "error") {
    return `${emoji} <b>${label}</b> · ${sessionLabel}\nSession encountered an error`
  }
  if (status === "plan_complete") {
    return `${emoji} <b>${label}</b> · ${sessionLabel}\nPlan completed`
  }
  return `${emoji} <b>${label}</b> · ${sessionLabel}: ${status}`
}

async function telegramApi(
  botToken: string,
  method: string,
  params: Record<string, unknown>,
): Promise<TelegramApiResponse> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return (await response.json()) as TelegramApiResponse
}

export type TelegramService = {
  start: () => void
  stop: () => void
  getStatus: () => TelegramServiceStatus
}

export function createTelegramService(
  config: TelegramServiceConfig,
  getPayload: () => Promise<DashboardMultiProjectPayload>,
): TelegramService {
  const pollIntervalMs = config.pollIntervalMs ?? 5000
  const debounceMs = config.debounceMs ?? 3000

  const state: TelegramState = {
    pinnedMessageId: null,
    prevSessionStatuses: new Map(),
    alertedSessions: new Set(),
    lastEditMs: 0,
    lastMessageText: "",
    alertsSent: 0,
    lastError: null,
    isFirstPoll: true,
  }

  let timer: ReturnType<typeof setInterval> | null = null

  async function sendMessage(text: string): Promise<number | null> {
    try {
      const result = await telegramApi(config.botToken, "sendMessage", {
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_notification: true,
      })
      if (!result.ok) {
        state.lastError = result.description ?? "sendMessage failed"
        return null
      }
      state.lastError = null
      return result.result?.message_id ?? null
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  async function editMessage(messageId: number, text: string): Promise<boolean> {
    try {
      const result = await telegramApi(config.botToken, "editMessageText", {
        chat_id: config.chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      })
      if (!result.ok) {
        if (result.description?.includes("message is not modified")) {
          return true
        }
        if (result.parameters?.retry_after) {
          state.lastError = `Rate limited, retry after ${result.parameters.retry_after}s`
          return false
        }
        state.lastError = result.description ?? "editMessageText failed"
        return false
      }
      state.lastError = null
      return true
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  async function pinMessage(messageId: number): Promise<void> {
    try {
      const result = await telegramApi(config.botToken, "pinChatMessage", {
        chat_id: config.chatId,
        message_id: messageId,
        disable_notification: true,
      })
      if (!result.ok) {
        state.lastError = result.description ?? "pinChatMessage failed"
      }
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
    }
  }

  async function sendAlert(text: string): Promise<void> {
    try {
      const result = await telegramApi(config.botToken, "sendMessage", {
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
      })
      if (result.ok) {
        state.alertsSent++
      }
    } catch {
      // Alert failures are non-critical
    }
  }

  function detectAlerts(payload: DashboardMultiProjectPayload): void {
    if (state.isFirstPoll) return

    for (const project of payload.projects) {
      for (const session of project.sessions) {
        const alertKey = `${session.sessionId}:${session.status}`

        if (ALERT_STATUSES.has(session.status)) {
          if (!state.alertedSessions.has(alertKey)) {
            state.alertedSessions.add(alertKey)
            const alertText = formatAlertMessage(project, session.sessionId, session.status)
            sendAlert(alertText)
          }
        } else {
          for (const s of ALERT_STATUSES) {
            state.alertedSessions.delete(`${session.sessionId}:${s}`)
          }
        }
      }
    }
  }

  function updatePrevStatuses(payload: DashboardMultiProjectPayload): void {
    state.prevSessionStatuses.clear()
    for (const project of payload.projects) {
      for (const session of project.sessions) {
        state.prevSessionStatuses.set(session.sessionId, session.status)
      }
    }
  }

  async function poll(): Promise<void> {
    try {
      const payload = await getPayload()
      const text = formatStatusMessage(payload)

      detectAlerts(payload)
      updatePrevStatuses(payload)

      const nowMs = Date.now()

      if (state.pinnedMessageId === null) {
        const messageId = await sendMessage(text)
        if (messageId !== null) {
          state.pinnedMessageId = messageId
          state.lastMessageText = text
          state.lastEditMs = nowMs
          await pinMessage(messageId)
        }
        state.isFirstPoll = false
        return
      }

      if (nowMs - state.lastEditMs < debounceMs) return

      if (text === state.lastMessageText) return

      const success = await editMessage(state.pinnedMessageId, text)
      if (success) {
        state.lastMessageText = text
        state.lastEditMs = nowMs
      }

      state.isFirstPoll = false
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
    }
  }

  function start(): void {
    if (timer !== null) return
    poll()
    timer = setInterval(poll, pollIntervalMs)
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function getStatus(): TelegramServiceStatus {
    return {
      enabled: true,
      pinnedMessageId: state.pinnedMessageId,
      lastUpdateMs: state.lastEditMs || null,
      lastError: state.lastError,
      alertsSent: state.alertsSent,
    }
  }

  return { start, stop, getStatus }
}
