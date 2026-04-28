import { vi } from "vitest"

/**
 * In-memory store for the mocked bun:sqlite Database.
 * Each "database" instance gets its own store, keyed by a symbol.
 * Tables are simulated as Maps keyed by table name.
 */
const DB_STORE = new WeakMap<object, Map<string, Map<string, Record<string, unknown>>>>()

function getStore(db: object): Map<string, Map<string, Record<string, unknown>>> {
  let store = DB_STORE.get(db)
  if (!store) {
    store = new Map()
    DB_STORE.set(db, store)
  }
  return store
}

function ensureTable(store: Map<string, Map<string, Record<string, unknown>>>, table: string): Map<string, Record<string, unknown>> {
  let tableMap = store.get(table)
  if (!tableMap) {
    tableMap = new Map()
    store.set(table, tableMap)
  }
  return tableMap
}

vi.mock("bun:sqlite", () => ({
  Database: vi.fn(() => {
    const dbInstance: Record<string, unknown> = {}
    const store = getStore(dbInstance)

    const query = vi.fn((sql: string) => {
      // Parse table name from SQL for routing
      const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i)
      const selectMatch = sql.match(/FROM\s+(\w+)/i)
      const tableName = insertMatch?.[1] ?? selectMatch?.[1] ?? "unknown"

      return {
        all: vi.fn((...args: unknown[]) => {
          const table = ensureTable(store, tableName)
          const rows = Array.from(table.values())

          // Basic WHERE filtering for simple cases
          // safety_suppressions: active = 1, scope = ?, scope_id = ?, expires_at > ?
          if (tableName === "safety_suppressions") {
            const [asOf] = args as [string]
            return rows.filter((r) => {
              if (r.active !== 1 && r.active !== true) return false
              if (r.expires_at && r.expires_at <= asOf) return false
              return true
            })
          }

          return rows
        }),
        get: vi.fn((...args: unknown[]) => {
          const table = ensureTable(store, tableName)
          // For SELECT with WHERE key = ? or id = ? or idempotency_key = ?
          const [param] = args as [string]
          for (const row of table.values()) {
            if (row.key === param || row.id === param || row.idempotency_key === param) {
              return row
            }
          }
          return null
        }),
        run: vi.fn((...args: unknown[]) => {
          const table = ensureTable(store, tableName)

          // Handle INSERT ... ON CONFLICT DO UPDATE
          const isUpsert = sql.includes("ON CONFLICT")
          const isInsert = sql.trim().toUpperCase().startsWith("INSERT")

          if (isInsert) {
            // Extract column names from INSERT INTO table (col1, col2, ...)
            const colMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i)
            if (colMatch) {
              const cols = colMatch[1].split(",").map((c: string) => c.trim())
              const row: Record<string, unknown> = {}
              cols.forEach((col: string, i: number) => {
                row[col] = args[i]
              })

              // For upsert, check if row exists by primary key (id or key)
              if (isUpsert) {
                const pk = row.id ?? row.key
                if (pk && table.has(pk as string)) {
                  // Update existing row
                  const existing = table.get(pk as string)
                  if (existing) {
                    Object.assign(existing, row)
                    return
                  }
                }
              }

              // Insert new row
              const pk = row.id ?? row.key
              if (pk) {
                table.set(pk as string, row)
              }
            }
          }
        }),
      }
    })

    return {
      query,
      run: vi.fn(),
      exec: vi.fn(),
      close: vi.fn(),
      transaction: vi.fn((fn: () => unknown) => fn),
    }
  }),
}))
