/**
 * Provider quota service — queries subscription usage limits for providers
 * configured in OpenCode's auth.json.
 *
 * Read-only observer: auth.json is never written. OAuth token refreshes are
 * held in memory only (OpenCode rotates the persisted tokens itself).
 *
 * Endpoints (community/codex-sourced, undocumented where noted):
 * - OpenCode Go:  GET https://opencode.ai/zen/go/v1/usage
 * - Z.AI:         GET https://api.z.ai/api/monitor/usage/quota/limit   (undocumented)
 * - Kimi:         GET https://api.kimi.com/coding/v1/usages            (undocumented)
 * - ChatGPT:      GET https://chatgpt.com/backend-api/wham/usage       (codex-rs contract)
 * - Ollama Cloud: GET https://ollama.com/api/usage                     (undocumented)
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { getDataDir } from "../ingest/paths"
import type {
  ProviderQuota,
  ProviderQuotasPayload,
  QuotaWindow,
} from "../types"

/* ── Constants ── */

const CACHE_TTL_MS = 3 * 60_000
const FETCH_TIMEOUT_MS = 10_000

const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token"
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const KIMI_TOKEN_URL = "https://auth.kimi.com/api/oauth/token"
const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098"

const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const ZAI_USAGE_URL = "https://api.z.ai/api/monitor/usage/quota/limit"
const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages"
const OPENAI_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const OLLAMA_USAGE_URL = "https://ollama.com/api/usage"

const HOUR_SECONDS = 3_600
const FIVE_HOURS_SECONDS = 5 * HOUR_SECONDS
const WEEK_SECONDS = 7 * 24 * HOUR_SECONDS

/** Minimal structural fetch signature — injectable for tests. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const GO_MONTH_SECONDS = 30 * 24 * HOUR_SECONDS

/* ── auth.json shape (read-only) ── */

type AuthEntryApi = { type: "api"; key: string }
type AuthEntryOauth = {
  type: "oauth"
  access: string
  refresh: string
  expiresMs: number
  accountId?: string
}
type AuthEntry = AuthEntryApi | AuthEntryOauth
type AuthFile = Record<string, AuthEntry>

function normalizeExpiresMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0
  // OpenCode stores ms epoch; tolerate seconds.
  return value < 1e12 ? value * 1_000 : value
}

export function parseAuthFile(raw: string): AuthFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
  const out: AuthFile = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "object" || value === null) continue
    const entry = value as Record<string, unknown>
    if (entry.type === "api" && typeof entry.key === "string" && entry.key.length > 0) {
      out[key] = { type: "api", key: entry.key }
    } else if (
      entry.type === "oauth" &&
      typeof entry.access === "string" && entry.access.length > 0 &&
      typeof entry.refresh === "string" && entry.refresh.length > 0
    ) {
      out[key] = {
        type: "oauth",
        access: entry.access,
        refresh: entry.refresh,
        expiresMs: normalizeExpiresMs(entry.expires),
        accountId: typeof entry.accountId === "string" ? entry.accountId : undefined,
      }
    }
  }
  return out
}

/* ── Helpers ── */

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function toIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/** Next epoch-aligned boundary for fixed-period windows (Ollama Cloud resets). */
function nextBoundaryMs(nowMs: number, periodSeconds: number): number {
  const periodMs = periodSeconds * 1_000
  return (Math.floor(nowMs / periodMs) + 1) * periodMs
}

/** First day of the next UTC calendar month (Kimi monthly cap has no reset field). */
function nextMonthBoundaryMs(nowMs: number): number {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

function windowLabel(seconds: number): { id: string; shortLabel: string; label: string } {
  if (seconds === FIVE_HOURS_SECONDS) return { id: "5h", shortLabel: "5H", label: "5-hour rolling" }
  if (seconds === WEEK_SECONDS) return { id: "weekly", shortLabel: "WK", label: "Weekly" }
  if (seconds === GO_MONTH_SECONDS) return { id: "monthly", shortLabel: "MO", label: "Monthly" }
  const hours = Math.round(seconds / HOUR_SECONDS)
  if (hours < 48) return { id: `${hours}h`, shortLabel: `${hours}H`, label: `${hours}-hour window` }
  return { id: "weekly", shortLabel: "WK", label: "Weekly" }
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
  }
  return res.json() as unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/* ── Pure response parsers (exported for tests) ── */

/** OpenCode Go: { usage: { rolling|weekly|monthly: { percent, resetsAt } } } */
export function parseGoUsage(body: unknown): QuotaWindow[] {
  const root = asRecord(body)
  const usage = root ? asRecord(root.usage) : null
  if (!usage) return []
  const windows: QuotaWindow[] = []
  const defs: Array<{ key: string; id: string; shortLabel: string; label: string }> = [
    { key: "rolling", id: "5h", shortLabel: "5H", label: "5-hour rolling" },
    { key: "weekly", id: "weekly", shortLabel: "WK", label: "Weekly" },
    { key: "monthly", id: "monthly", shortLabel: "MO", label: "Monthly" },
  ]
  for (const def of defs) {
    const win = asRecord(usage[def.key])
    if (!win) continue
    const percent = toNumber(win.percent)
    if (percent === null) continue
    windows.push({
      id: def.id,
      shortLabel: def.shortLabel,
      label: def.label,
      usedPercent: clampPercent(percent),
      resetsAtMs: toIsoMs(win.resetsAt),
    })
  }
  return windows
}

/**
 * Z.AI: { data: { limits: [{ type, unit, number, percentage?, currentValue?, usage?, nextResetTime? }] } }
 * (unit=3,number=5) → 5h; (unit=6,number=1) → weekly; TIME_LIMIT → monthly tools budget.
 */
export function parseZaiUsage(body: unknown): QuotaWindow[] {
  const root = asRecord(body)
  const data = root ? asRecord(root.data) : null
  const limits = data && Array.isArray(data.limits) ? data.limits : null
  if (!limits) {
    // Legacy flat shape: fiveHourPercent / weeklyPercent at data level.
    if (!data) return []
    const windows: QuotaWindow[] = []
    const fiveHour = toNumber(data.fiveHourPercent)
    if (fiveHour !== null) {
      windows.push({ id: "5h", shortLabel: "5H", label: "5-hour rolling", usedPercent: clampPercent(fiveHour), resetsAtMs: null })
    }
    const weekly = toNumber(data.weeklyPercent)
    if (weekly !== null) {
      windows.push({ id: "weekly", shortLabel: "WK", label: "Weekly", usedPercent: clampPercent(weekly), resetsAtMs: null })
    }
    return windows
  }
  const windows: QuotaWindow[] = []
  for (const raw of limits) {
    const row = asRecord(raw)
    if (!row) continue
    let def: { id: string; shortLabel: string; label: string } | null = null
    if (row.type === "TIME_LIMIT") {
      def = { id: "monthly", shortLabel: "MO", label: "Monthly tools" }
    } else if (row.unit === 3 && row.number === 5) {
      def = { id: "5h", shortLabel: "5H", label: "5-hour rolling" }
    } else if (row.unit === 6 && row.number === 1) {
      def = { id: "weekly", shortLabel: "WK", label: "Weekly" }
    }
    if (!def) continue
    let percent = toNumber(row.percentage)
    if (percent === null) {
      const used = toNumber(row.currentValue)
      const total = toNumber(row.usage)
      if (used !== null && total !== null && total > 0) percent = (used / total) * 100
    }
    if (percent === null) continue
    const resetMs = toNumber(row.nextResetTime)
    windows.push({
      id: def.id,
      shortLabel: def.shortLabel,
      label: def.label,
      usedPercent: clampPercent(percent),
      resetsAtMs: resetMs !== null && resetMs > 0 ? resetMs : null,
    })
  }
  return windows
}

/**
 * Kimi: strings for all numbers. usage → weekly, limits[0] → 5h session,
 * totalQuota → monthly membership cap (no reset field → next month boundary).
 */
export function parseKimiUsage(body: unknown, nowMs: number): QuotaWindow[] {
  const root = asRecord(body)
  if (!root) return []
  const windows: QuotaWindow[] = []

  const readUsage = (record: Record<string, unknown>): { usedPercent: number; resetsAtMs: number | null } | null => {
    const limit = toNumber(record.limit)
    if (limit === null || limit <= 0) return null
    const remaining = toNumber(record.remaining)
    const used = toNumber(record.used)
    let usedPercent: number
    if (remaining !== null) usedPercent = ((limit - remaining) / limit) * 100
    else if (used !== null) usedPercent = (used / limit) * 100
    else return null
    const reset = toIsoMs(record.resetTime) ?? toIsoMs(record.reset_at)
    return { usedPercent: clampPercent(usedPercent), resetsAtMs: reset }
  }

  const usage = asRecord(root.usage)
  if (usage) {
    const parsed = readUsage(usage)
    if (parsed) windows.push({ id: "weekly", shortLabel: "WK", label: "Weekly", ...parsed })
  }

  if (Array.isArray(root.limits)) {
    for (const raw of root.limits) {
      const entry = asRecord(raw)
      if (!entry) continue
      const win = asRecord(entry.window)
      const duration = win ? toNumber(win.duration) : null
      const detail = asRecord(entry.detail)
      if (!detail) continue
      const parsed = readUsage(detail)
      if (!parsed) continue
      if (duration === 300) {
        windows.push({ id: "5h", shortLabel: "5H", label: "5-hour rolling", ...parsed })
      } else {
        windows.push({ id: "window", shortLabel: "WIN", label: "Rate window", ...parsed })
      }
    }
  }

  const totalQuota = asRecord(root.totalQuota)
  if (totalQuota) {
    const limit = toNumber(totalQuota.limit)
    const used = toNumber(totalQuota.used) ?? (limit !== null && typeof totalQuota.remaining !== "undefined"
      ? limit - (toNumber(totalQuota.remaining) ?? 0)
      : null)
    if (limit !== null && limit > 0 && used !== null) {
      windows.push({
        id: "monthly",
        shortLabel: "MO",
        label: "Monthly cap",
        usedPercent: clampPercent((used / limit) * 100),
        resetsAtMs: nextMonthBoundaryMs(nowMs),
      })
    }
  }
  return windows
}

/** ChatGPT (codex): rate_limit.primary_window / secondary_window with used_percent. */
export function parseOpenAiUsage(body: unknown): QuotaWindow[] {
  const root = asRecord(body)
  const rateLimit = root ? asRecord(root.rate_limit) : null
  if (!rateLimit) return []
  const windows: QuotaWindow[] = []
  for (const key of ["primary_window", "secondary_window"] as const) {
    const win = asRecord(rateLimit[key])
    if (!win) continue
    const percent = toNumber(win.used_percent)
    if (percent === null) continue
    const windowSeconds = toNumber(win.limit_window_seconds) ?? FIVE_HOURS_SECONDS
    const def = windowLabel(windowSeconds)
    const resetAtSec = toNumber(win.reset_at)
    const resetAfterSec = toNumber(win.reset_after_seconds)
    windows.push({
      id: def.id,
      shortLabel: def.shortLabel,
      label: def.label,
      usedPercent: clampPercent(percent),
      resetsAtMs:
        resetAtSec !== null && resetAtSec > 0
          ? resetAtSec * 1_000
          : resetAfterSec !== null
            ? Date.now() + resetAfterSec * 1_000
            : null,
    })
  }
  return windows
}

/** Ollama Cloud: limits.{session,weekly}.usage as 0..1 fractions, no reset timestamps. */
export function parseOllamaUsage(body: unknown, nowMs: number): QuotaWindow[] {
  const root = asRecord(body)
  const limits = root ? asRecord(root.limits) : null
  if (!limits) return []
  const windows: QuotaWindow[] = []
  const defs: Array<{ key: string; id: string; shortLabel: string; label: string; periodSeconds: number }> = [
    { key: "session", id: "5h", shortLabel: "5H", label: "5-hour rolling", periodSeconds: FIVE_HOURS_SECONDS },
    { key: "weekly", id: "weekly", shortLabel: "WK", label: "Weekly", periodSeconds: WEEK_SECONDS },
  ]
  for (const def of defs) {
    const win = asRecord(limits[def.key])
    if (!win) continue
    const fraction = toNumber(win.usage)
    if (fraction === null) continue
    windows.push({
      id: def.id,
      shortLabel: def.shortLabel,
      label: def.label,
      usedPercent: clampPercent(fraction * 100),
      resetsAtMs: nextBoundaryMs(nowMs, def.periodSeconds),
    })
  }
  return windows
}

/* ── OAuth refresh (in-memory only) ── */

type RefreshedToken = { access: string; expiresMs: number }
const refreshedTokens = new Map<string, RefreshedToken>()

function isFresh(token: RefreshedToken, nowMs: number): boolean {
  return token.expiresMs - 60_000 > nowMs
}

async function refreshOAuthToken(args: {
  providerKey: string
  tokenUrl: string
  clientId: string
  refreshToken: string
  fetchImpl: FetchLike
}): Promise<RefreshedToken> {
  const cached = refreshedTokens.get(args.providerKey)
  const nowMs = Date.now()
  if (cached && isFresh(cached, nowMs)) return cached

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.clientId,
  })
  const res = await args.fetchImpl(args.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`token refresh failed: HTTP ${res.status}`)
  }
  const json = asRecord(await res.json() as unknown)
  const access = json && typeof json.access_token === "string" ? json.access_token : null
  if (!access) throw new Error("token refresh response missing access_token")
  const expiresIn = (json !== null ? toNumber(json.expires_in) : null) ?? 3_600
  const token: RefreshedToken = {
    access,
    expiresMs: Date.now() + expiresIn * 1_000,
  }
  refreshedTokens.set(args.providerKey, token)
  return token
}

/** Resolve a usable bearer token for an oauth entry, refreshing when expired. */
async function resolveOauthAccessToken(args: {
  providerKey: string
  entry: AuthEntryOauth
  tokenUrl: string
  clientId: string
  fetchImpl: FetchLike
}): Promise<string> {
  const nowMs = Date.now()
  const cached = refreshedTokens.get(args.providerKey)
  if (cached && isFresh(cached, nowMs)) return cached.access
  if (args.entry.expiresMs - 60_000 > nowMs) return args.entry.access
  const token = await refreshOAuthToken({
    providerKey: args.providerKey,
    tokenUrl: args.tokenUrl,
    clientId: args.clientId,
    refreshToken: args.entry.refresh,
    fetchImpl: args.fetchImpl,
  })
  return token.access
}

/* ── Provider registry ── */

type ProviderFetchArgs = {
  auth: AuthFile
  fetchImpl: FetchLike
  nowMs: number
}

type ProviderDef = {
  providerId: string
  name: string
  symbol: string
  /** auth.json keys to probe in order; first present wins */
  authKeys: string[]
  fetchWindows: (args: ProviderFetchArgs & { entry: AuthEntry }) => Promise<QuotaWindow[]>
}

const providerDefs: ProviderDef[] = [
  {
    providerId: "opencode-go",
    name: "OpenCode Go",
    symbol: "GO",
    authKeys: ["opencode-go"],
    fetchWindows: async ({ entry, fetchImpl }) => {
      if (entry.type !== "api") throw new Error("opencode-go auth entry is not an API key")
      const body = await fetchJson(fetchImpl, GO_USAGE_URL, {
        Authorization: `Bearer ${entry.key}`,
      })
      return parseGoUsage(body)
    },
  },
  {
    providerId: "zai-coding-plan",
    name: "Z.AI",
    symbol: "Z",
    authKeys: ["zai-coding-plan"],
    fetchWindows: async ({ entry, fetchImpl }) => {
      if (entry.type !== "api") throw new Error("zai-coding-plan auth entry is not an API key")
      const body = await fetchJson(fetchImpl, ZAI_USAGE_URL, {
        Authorization: `Bearer ${entry.key}`,
      })
      return parseZaiUsage(body)
    },
  },
  {
    providerId: "kimi",
    name: "Kimi",
    symbol: "KI",
    authKeys: ["kimi-code", "kimi-for-coding-oauth", "moonshot"],
    fetchWindows: async ({ entry, fetchImpl, nowMs }) => {
      let token: string
      if (entry.type === "oauth") {
        token = await resolveOauthAccessToken({
          providerKey: "kimi-for-coding-oauth",
          entry,
          tokenUrl: KIMI_TOKEN_URL,
          clientId: KIMI_CLIENT_ID,
          fetchImpl,
        })
      } else {
        token = entry.key
      }
      const body = await fetchJson(fetchImpl, KIMI_USAGE_URL, {
        Authorization: `Bearer ${token}`,
      })
      return parseKimiUsage(body, nowMs)
    },
  },
  {
    providerId: "openai",
    name: "ChatGPT",
    symbol: "GP",
    authKeys: ["openai"],
    fetchWindows: async ({ entry, fetchImpl }) => {
      if (entry.type !== "oauth") throw new Error("openai auth entry is not OAuth")
      const token = await resolveOauthAccessToken({
        providerKey: "openai",
        entry,
        tokenUrl: OPENAI_TOKEN_URL,
        clientId: OPENAI_CLIENT_ID,
        fetchImpl,
      })
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "User-Agent": "omo-pulse",
      }
      if (entry.accountId) headers["ChatGPT-Account-Id"] = entry.accountId
      const body = await fetchJson(fetchImpl, OPENAI_USAGE_URL, headers)
      return parseOpenAiUsage(body)
    },
  },
  {
    providerId: "ollama-cloud",
    name: "Ollama Cloud",
    symbol: "OL",
    authKeys: ["ollama-cloud"],
    fetchWindows: async ({ entry, fetchImpl, nowMs }) => {
      if (entry.type !== "api") throw new Error("ollama-cloud auth entry is not an API key")
      const body = await fetchJson(fetchImpl, OLLAMA_USAGE_URL, {
        Authorization: `Bearer ${entry.key}`,
      })
      return parseOllamaUsage(body, nowMs)
    },
  },
]

/* ── Service ── */

export type QuotaService = {
  getQuotas: () => Promise<ProviderQuotasPayload>
  invalidate: () => void
}

export type QuotaServiceOptions = {
  authPath?: string
  cacheTtlMs?: number
  fetchImpl?: FetchLike
  now?: () => number
}

export function defaultAuthPath(): string {
  return join(getDataDir(), "opencode", "auth.json")
}

export function createQuotaService(opts: QuotaServiceOptions = {}): QuotaService {
  const authPath = opts.authPath ?? defaultAuthPath()
  const cacheTtlMs = opts.cacheTtlMs ?? CACHE_TTL_MS
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => Date.now())

  let cache: { atMs: number; payload: ProviderQuotasPayload } | null = null
  let inFlight: Promise<ProviderQuotasPayload> | null = null

  const fetchOne = async (def: ProviderDef, auth: AuthFile): Promise<ProviderQuota> => {
    const fetchedAtMs = now()
    let entry: AuthEntry | undefined
    for (const key of def.authKeys) {
      const candidate = auth[key]
      if (candidate) {
        entry = candidate
        break
      }
    }
    if (!entry) {
      return {
        providerId: def.providerId,
        name: def.name,
        symbol: def.symbol,
        windows: [],
        status: "unconfigured",
        fetchedAtMs,
      }
    }
    try {
      const windows = await def.fetchWindows({ auth, entry, fetchImpl, nowMs: fetchedAtMs })
      return {
        providerId: def.providerId,
        name: def.name,
        symbol: def.symbol,
        windows,
        status: "ok",
        fetchedAtMs,
      }
    } catch (err) {
      return {
        providerId: def.providerId,
        name: def.name,
        symbol: def.symbol,
        windows: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        fetchedAtMs,
      }
    }
  }

  const refresh = async (): Promise<ProviderQuotasPayload> => {
    let auth: AuthFile = {}
    try {
      auth = parseAuthFile(await readFile(authPath, "utf8"))
    } catch {
      // Missing/unreadable auth.json → every provider reports unconfigured.
    }
    const providers = await Promise.all(providerDefs.map((def) => fetchOne(def, auth)))
    return { providers, serverNowMs: now() }
  }

  const getQuotas = async (): Promise<ProviderQuotasPayload> => {
    const currentMs = now()
    if (cache && currentMs - cache.atMs < cacheTtlMs) return cache.payload
    if (inFlight) return inFlight
    inFlight = refresh()
      .then((payload) => {
        cache = { atMs: now(), payload }
        return payload
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    getQuotas,
    invalidate: () => {
      cache = null
    },
  }
}
