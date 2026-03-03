import { vi } from "vitest"

vi.mock("bun:sqlite", () => ({
  Database: vi.fn(() => ({
    query: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => null) })),
    close: vi.fn(),
  })),
}))
