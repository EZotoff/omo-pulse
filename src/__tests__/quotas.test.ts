import { describe, expect, it } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createQuotaService,
  parseAuthFile,
  parseGoUsage,
  parseKimiUsage,
  parseOllamaUsage,
  parseOpenAiUsage,
  parseZaiUsage,
  type FetchLike,
} from "../server/quotas"
import type { ProviderQuotasPayload } from "../types"

/* ── Test helpers ── */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const NOW_MS = Date.UTC(2026, 8, 12, 12, 0, 0)

/* ── Parsers ── */

describe("parseGoUsage", () => {
  it("maps rolling/weekly/monthly windows", () => {
    const windows = parseGoUsage({
      usage: {
        rolling: { status: "ok", percent: 12.4, resetsAt: "2026-09-12T16:00:00Z" },
        weekly: { status: "ok", percent: 40, resetsAt: "2026-09-14T00:00:00Z" },
        monthly: { status: "rate-limited", percent: 99.9, resetsAt: null },
      },
    })
    expect(windows).toHaveLength(3)
    expect(windows[0]).toMatchObject({ id: "5h", shortLabel: "5H", usedPercent: 12.4 })
    expect(windows[0].resetsAtMs).toBe(Date.parse("2026-09-12T16:00:00Z"))
    expect(windows[1]).toMatchObject({ id: "weekly", shortLabel: "WK" })
    expect(windows[2]).toMatchObject({ id: "monthly", shortLabel: "MO", usedPercent: 99.9 })
    expect(windows[2].resetsAtMs).toBeNull()
  })

  it("returns empty for malformed bodies", () => {
    expect(parseGoUsage(null)).toEqual([])
    expect(parseGoUsage({})).toEqual([])
    expect(parseGoUsage({ usage: { rolling: { percent: "NaN" } } })).toEqual([])
  })
})

describe("parseZaiUsage", () => {
  it("decodes limit rows by unit/number", () => {
    const windows = parseZaiUsage({
      code: 200,
      success: true,
      data: {
        level: "max",
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 15, nextResetTime: NOW_MS + 3_600_000 },
          { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 20, nextResetTime: NOW_MS + 86_400_000 },
          { type: "TIME_LIMIT", unit: 5, number: 1, percentage: 45 },
          { type: "TOKENS_LIMIT", unit: 9, number: 9, percentage: 50 }, // unknown → skipped
        ],
      },
    })
    expect(windows.map((w) => w.id)).toEqual(["5h", "weekly", "monthly"])
    expect(windows[0]).toMatchObject({ shortLabel: "5H", usedPercent: 15, resetsAtMs: NOW_MS + 3_600_000 })
    expect(windows[2]).toMatchObject({ shortLabel: "MO", resetsAtMs: null })
  })

  it("derives percentage from currentValue/usage when percentage is missing", () => {
    const windows = parseZaiUsage({
      data: { limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, usage: 800, currentValue: 200 }] },
    })
    expect(windows).toHaveLength(1)
    expect(windows[0].usedPercent).toBeCloseTo(25)
  })

  it("falls back to legacy flat fields", () => {
    const windows = parseZaiUsage({ data: { fiveHourPercent: 10, weeklyPercent: 30 } })
    expect(windows.map((w) => w.id)).toEqual(["5h", "weekly"])
    expect(windows[0].usedPercent).toBe(10)
  })
})

describe("parseKimiUsage", () => {
  const nowMs = Date.UTC(2026, 8, 12, 12, 0, 0)

  it("coerces string numbers and maps weekly/5h/monthly", () => {
    const windows = parseKimiUsage(
      {
        usage: { limit: "100", remaining: "70", resetTime: "2026-09-14T09:59:07Z" },
        limits: [
          {
            window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
            detail: { limit: "40", remaining: "10", resetTime: "2026-09-12T15:00:00Z" },
          },
        ],
        totalQuota: { limit: "1000", used: "250" },
      },
      nowMs,
    )
    expect(windows).toHaveLength(3)
    expect(windows.find((w) => w.id === "weekly")?.usedPercent).toBeCloseTo(30)
    expect(windows.find((w) => w.id === "5h")?.usedPercent).toBeCloseTo(75)
    const monthly = windows.find((w) => w.id === "monthly")
    expect(monthly?.usedPercent).toBeCloseTo(25)
    expect(monthly?.resetsAtMs).toBe(Date.UTC(2026, 9, 1, 0, 0, 0)) // next month boundary
  })

  it("derives usedPercent from used when remaining is missing", () => {
    const windows = parseKimiUsage({ usage: { limit: "100", used: "25", resetTime: "" } }, nowMs)
    expect(windows).toHaveLength(1)
    expect(windows[0].usedPercent).toBeCloseTo(25)
  })

  it("returns empty for malformed bodies", () => {
    expect(parseKimiUsage(null, nowMs)).toEqual([])
    expect(parseKimiUsage("nope", nowMs)).toEqual([])
  })
})

describe("parseOpenAiUsage", () => {
  it("maps primary/secondary windows with epoch-second resets", () => {
    const windows = parseOpenAiUsage({
      plan_type: "plus",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 12,
          limit_window_seconds: 18000,
          reset_after_seconds: 3600,
          reset_at: 1_789_000_000,
        },
        secondary_window: { used_percent: 4, limit_window_seconds: 604800, reset_after_seconds: 86400 },
      },
    })
    expect(windows).toHaveLength(2)
    expect(windows[0]).toMatchObject({ id: "5h", shortLabel: "5H", usedPercent: 12 })
    expect(windows[0].resetsAtMs).toBe(1_789_000_000 * 1000)
    expect(windows[1]).toMatchObject({ id: "weekly", shortLabel: "WK", usedPercent: 4 })
    expect(windows[1].resetsAtMs).toBeGreaterThan(Date.now())
  })

  it("tolerates missing windows", () => {
    expect(parseOpenAiUsage({ rate_limit: { primary_window: null } })).toEqual([])
    expect(parseOpenAiUsage({})).toEqual([])
  })
})

describe("parseOllamaUsage", () => {
  const nowMs = Date.UTC(2026, 8, 12, 12, 0, 0)

  it("converts 0..1 fractions to percent with epoch-aligned resets", () => {
    const windows = parseOllamaUsage(
      { limits: { session: { usage: 0.046 }, weekly: { usage: 0.051 } } },
      nowMs,
    )
    expect(windows).toHaveLength(2)
    expect(windows[0]).toMatchObject({ id: "5h", usedPercent: 4.6 })
    const fiveHourPeriodMs = 5 * 3_600_000
    expect(windows[0].resetsAtMs).toBe((Math.floor(nowMs / fiveHourPeriodMs) + 1) * fiveHourPeriodMs)
    expect(windows[1]).toMatchObject({ id: "weekly", usedPercent: 5.1 })
  })

  it("returns empty when limits absent", () => {
    expect(parseOllamaUsage({ limits: {} }, nowMs)).toEqual([])
    expect(parseOllamaUsage(null, nowMs)).toEqual([])
  })
})

describe("parseAuthFile", () => {
  it("parses api and oauth entries", () => {
    const auth = parseAuthFile(
      JSON.stringify({
        "opencode-go": { type: "api", key: "sk-go" },
        openai: {
          type: "oauth",
          access: "at",
          refresh: "rt",
          expires: NOW_MS,
          accountId: "acc-1",
        },
        broken: { type: "api" },
      }),
    )
    expect(auth["opencode-go"]).toEqual({ type: "api", key: "sk-go" })
    expect(auth["openai"]).toMatchObject({ type: "oauth", access: "at", accountId: "acc-1" })
    expect(auth["broken"]).toBeUndefined()
  })

  it("returns empty for garbage", () => {
    expect(parseAuthFile("not json")).toEqual({})
    expect(parseAuthFile("[1,2]")).toEqual({})
  })

  it("normalizes second-based expires to ms", () => {
    const auth = parseAuthFile(
      JSON.stringify({ openai: { type: "oauth", access: "a", refresh: "r", expires: 1_789_000_000 } }),
    )
    expect(auth["openai"]?.type === "oauth" && auth["openai"].expiresMs).toBe(1_789_000_000_000)
  })
})

/* ── Service ── */

async function withTempAuth(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "omo-quotas-"))
  const authPath = join(dir, "auth.json")
  await writeFile(authPath, contents, "utf8")
  return authPath
}

describe("createQuotaService", () => {
  it("reports unconfigured providers when auth entries are missing", async () => {
    const authPath = await withTempAuth(JSON.stringify({}))
    const service = createQuotaService({ authPath, fetchImpl: async () => jsonResponse({}) })
    const payload = await service.getQuotas()
    expect(payload.providers).toHaveLength(5)
    expect(payload.providers.every((p) => p.status === "unconfigured")).toBe(true)
  })

  it("isolates per-provider errors and serves from cache within TTL", async () => {
    const authPath = await withTempAuth(
      JSON.stringify({
        "opencode-go": { type: "api", key: "sk-go" },
        "zai-coding-plan": { type: "api", key: "sk-zai" },
      }),
    )
    let callCount = 0
    const fetchImpl: FetchLike = async (input) => {
      callCount += 1
      const url = String(input)
      if (new URL(url).host === "opencode.ai") return jsonResponse({ message: "denied" }, 403)
      if (new URL(url).host === "api.z.ai") {
        return jsonResponse({
          data: { limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 22 }] },
        })
      }
      return jsonResponse({})
    }
    let nowMs = NOW_MS
    const service = createQuotaService({
      authPath,
      fetchImpl,
      now: () => nowMs,
      cacheTtlMs: 60_000,
    })

    const first = await service.getQuotas()
    const go = first.providers.find((p) => p.providerId === "opencode-go")
    const zai = first.providers.find((p) => p.providerId === "zai-coding-plan")
    expect(go).toMatchObject({ status: "error" })
    expect(go?.error).toContain("403")
    expect(zai).toMatchObject({ status: "ok" })
    expect(zai?.windows[0]).toMatchObject({ id: "5h", usedPercent: 22 })
    const callsAfterFirst = callCount

    nowMs += 30_000 // still within TTL
    const second = await service.getQuotas()
    expect(callCount).toBe(callsAfterFirst)
    expect(second.serverNowMs).toBe(NOW_MS) // cached payload keeps first-fetch timestamp

    nowMs += 31_000 // TTL elapsed → refetch
    await service.getQuotas()
    expect(callCount).toBeGreaterThan(callsAfterFirst)
  })

  it("refreshes expired OpenAI OAuth tokens in memory and uses the new token", async () => {
    const authPath = await withTempAuth(
      JSON.stringify({
        openai: { type: "oauth", access: "stale", refresh: "rt", expires: Date.now() - 60_000, accountId: "acc" },
      }),
    )
    const seenAuth: string[] = []
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input)
      const headers = (init?.headers ?? {}) as Record<string, string>
      if (new URL(url).host === "auth.openai.com") {
        expect(init?.method).toBe("POST")
        return jsonResponse({ access_token: "fresh", refresh_token: "rt2", expires_in: 3600 })
      }
      if (new URL(url).pathname === "/backend-api/wham/usage") {
        seenAuth.push(headers.Authorization ?? "")
        seenAuth.push(headers["ChatGPT-Account-Id"] ?? "")
        return jsonResponse({
          rate_limit: { primary_window: { used_percent: 33, limit_window_seconds: 18000 } },
        })
      }
      return jsonResponse({})
    }
    const service = createQuotaService({ authPath, fetchImpl })
    const payload = await service.getQuotas()
    const openai = payload.providers.find((p) => p.providerId === "openai")
    expect(openai).toMatchObject({ status: "ok" })
    expect(openai?.windows[0]).toMatchObject({ id: "5h", usedPercent: 33 })
    expect(seenAuth[0]).toBe("Bearer fresh")
    expect(seenAuth[1]).toBe("acc")
  })

  it("reports an error payload shape matching ProviderQuotasPayload", async () => {
    const authPath = await withTempAuth(
      JSON.stringify({ "ollama-cloud": { type: "api", key: "sk-ol" } }),
    )
    const fetchImpl: FetchLike = async () => jsonResponse({ limits: { session: { usage: 0.5 } } })
    const service = createQuotaService({ authPath, fetchImpl })
    const payload: ProviderQuotasPayload = await service.getQuotas()
    expect(payload.serverNowMs).toBeGreaterThan(0)
    const ollama = payload.providers.find((p) => p.providerId === "ollama-cloud")
    expect(ollama?.windows.map((w) => w.id)).toContain("5h")
    expect(typeof ollama?.symbol).toBe("string")
  })

  it("fetches favicons as data URIs, sniffs missing content-types, and degrades to null", async () => {
    const authPath = await withTempAuth(
      JSON.stringify({ "ollama-cloud": { type: "api", key: "sk-ol" } }),
    )
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const icoBytes = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x03, 0x00])
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input)
      if (new URL(url).host === "ollama.com") {
        return new Response(pngBytes, { status: 200, headers: { "Content-Type": "image/png" } })
      }
      if (new URL(url).host === "www.kimi.com") {
        // Kimi serves a real ICO without a content-type header.
        return new Response(icoBytes, { status: 200 })
      }
      return jsonResponse({})
    }
    const service = createQuotaService({ authPath, fetchImpl })
    const payload = await service.getQuotas()
    const ollama = payload.providers.find((p) => p.providerId === "ollama-cloud")
    expect(ollama?.icon?.startsWith("data:image/png;base64,")).toBe(true)
    const kimi = payload.providers.find((p) => p.providerId === "kimi")
    expect(kimi?.icon?.startsWith("data:image/x-icon;base64,")).toBe(true)
    const zai = payload.providers.find((p) => p.providerId === "zai-coding-plan")
    expect(zai?.icon).toBeNull()
    expect(zai?.status).toBe("unconfigured")
  })
})
