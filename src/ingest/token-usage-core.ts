import { extractModelString } from "./model"

export type TokenUsageRow = {
  model: string
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export type TokenUsageTotals = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface TokenUsagePayload {
  rows: TokenUsageRow[]
  totals: TokenUsageTotals
}

const EMPTY_TOTALS: TokenUsageTotals = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
}

function clampToken(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function blankRow(model: string): TokenUsageRow {
  return { model, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

export function aggregateTokenUsage(metas: unknown[]): TokenUsagePayload {
  const rowsByModel = new Map<string, TokenUsageRow>()
  const seenMessageIds = new Set<string>()

  for (const metaUnknown of metas) {
    if (!isRecord(metaUnknown)) continue
    const role = readString(metaUnknown.role)
    if (role !== "assistant") continue

    const id = readString(metaUnknown.id)
    if (id) {
      if (seenMessageIds.has(id)) continue
      seenMessageIds.add(id)
    }

    const model = extractModelString(metaUnknown) ?? "unknown/unknown"
    const tokens = isRecord(metaUnknown.tokens) ? metaUnknown.tokens : null
    const cache = tokens && isRecord(tokens.cache) ? tokens.cache : null
    const input = clampToken(tokens?.input)
    const output = clampToken(tokens?.output)
    const reasoning = clampToken(tokens?.reasoning)
    const cacheRead = clampToken(cache?.read)
    const cacheWrite = clampToken(cache?.write)
    const total = input + output + reasoning + cacheRead + cacheWrite

    const row = rowsByModel.get(model) ?? blankRow(model)
    row.input += input
    row.output += output
    row.reasoning += reasoning
    row.cacheRead += cacheRead
    row.cacheWrite += cacheWrite
    row.total += total
    rowsByModel.set(model, row)
  }

  const rows = Array.from(rowsByModel.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total
    return a.model.localeCompare(b.model)
  })
  const totals = rows.reduce(
    (acc, row) => ({
      input: acc.input + row.input,
      output: acc.output + row.output,
      reasoning: acc.reasoning + row.reasoning,
      cacheRead: acc.cacheRead + row.cacheRead,
      cacheWrite: acc.cacheWrite + row.cacheWrite,
      total: acc.total + row.total,
    }),
    { ...EMPTY_TOTALS }
  )

  return { rows, totals }
}

export const EMPTY_TOKEN_USAGE_PAYLOAD: TokenUsagePayload = {
  rows: [],
  totals: { ...EMPTY_TOTALS },
}

export const TokenUsagePayload = EMPTY_TOKEN_USAGE_PAYLOAD
