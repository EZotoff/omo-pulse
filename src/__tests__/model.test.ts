import { describe, expect, it } from "vitest"
import { extractModelString, pickLatestModelString } from "../ingest/model"

describe("extractModelString", () => {
  it("returns null for non-record input", () => {
    expect(extractModelString(null)).toBe(null)
    expect(extractModelString(undefined)).toBe(null)
    expect(extractModelString("anthropic/claude-sonnet-4")).toBe(null)
    expect(extractModelString(42)).toBe(null)
    expect(extractModelString(["anthropic", "claude-sonnet-4"])).toBe(null)
  })

  it("joins direct providerID/modelID fields", () => {
    expect(extractModelString({ providerID: "anthropic", modelID: "claude-sonnet-4" })).toBe(
      "anthropic/claude-sonnet-4",
    )
  })

  it("accepts camelCase and snake_case key variants", () => {
    expect(extractModelString({ providerId: "openai", modelId: "gpt-4o" })).toBe("openai/gpt-4o")
    expect(extractModelString({ provider_id: "google", model_id: "gemini-2" })).toBe("google/gemini-2")
  })

  it("prefers providerID over providerId over provider_id", () => {
    expect(
      extractModelString({ providerID: "a", providerId: "b", provider_id: "c", modelID: "m" }),
    ).toBe("a/m")
    expect(extractModelString({ providerId: "b", provider_id: "c", modelId: "m" })).toBe("b/m")
  })

  it("trims surrounding whitespace from field values", () => {
    expect(extractModelString({ providerID: "  anthropic  ", modelID: "\tclaude-3\n" })).toBe(
      "anthropic/claude-3",
    )
  })

  it("treats blank or whitespace-only fields as missing", () => {
    expect(extractModelString({ providerID: "   ", modelID: "m" })).toBe(null)
    expect(extractModelString({ providerID: "p", modelID: "" })).toBe(null)
  })

  it("treats non-string field values as missing", () => {
    expect(extractModelString({ providerID: 1, modelID: "m" })).toBe(null)
    expect(extractModelString({ providerID: "p", modelID: true })).toBe(null)
  })

  it("returns null when either direct part is missing", () => {
    expect(extractModelString({ providerID: "anthropic" })).toBe(null)
    expect(extractModelString({ modelID: "claude-3" })).toBe(null)
    expect(extractModelString({})).toBe(null)
  })

  it("falls back to a nested model record when direct parts are incomplete", () => {
    expect(extractModelString({ model: { providerID: "openai", modelID: "gpt-4o" } })).toBe(
      "openai/gpt-4o",
    )
    expect(extractModelString({ providerID: "x", model: { providerID: "openai", modelID: "gpt-4o" } })).toBe(
      "openai/gpt-4o",
    )
  })

  it("prefers direct parts over a complete nested model record", () => {
    expect(
      extractModelString({
        providerID: "direct",
        modelID: "winner",
        model: { providerID: "nested", modelID: "loser" },
      }),
    ).toBe("direct/winner")
  })

  it("ignores a non-record nested model value", () => {
    expect(extractModelString({ model: "openai/gpt-4o" })).toBe(null)
    expect(extractModelString({ model: { providerID: "openai" } })).toBe(null)
  })
})

describe("pickLatestModelString", () => {
  it("returns null for empty or entirely invalid metas", () => {
    expect(pickLatestModelString([])).toBe(null)
    expect(pickLatestModelString([null, "anthropic/claude-3", 42, { time: { created: 5 } }])).toBe(null)
  })

  it("picks the meta with the greatest time.created", () => {
    const metas = [
      { id: "ses_old", time: { created: 1000 }, providerID: "anthropic", modelID: "claude-3" },
      { id: "ses_new", time: { created: 2000 }, providerID: "anthropic", modelID: "claude-4" },
    ]
    expect(pickLatestModelString(metas)).toBe("anthropic/claude-4")
  })

  it("prefers an assistant meta over a newer non-assistant meta", () => {
    const metas = [
      { id: "ses_user", role: "user", time: { created: 2000 }, providerID: "u", modelID: "user-model" },
      { id: "ses_asst", role: "assistant", time: { created: 1000 }, providerID: "a", modelID: "asst-model" },
    ]
    expect(pickLatestModelString(metas)).toBe("a/asst-model")
  })

  it("prefers the newest assistant when several exist", () => {
    const metas = [
      { id: "ses_u", role: "user", time: { created: 3000 }, providerID: "u", modelID: "user-model" },
      { id: "ses_a1", role: "assistant", time: { created: 1000 }, providerID: "a", modelID: "old-asst" },
      { id: "ses_a2", role: "assistant", time: { created: 2000 }, providerID: "a", modelID: "new-asst" },
    ]
    expect(pickLatestModelString(metas)).toBe("a/new-asst")
  })

  it("falls back to the newest candidate when no assistant exists", () => {
    const metas = [
      { id: "ses_1", role: "user", time: { created: 1000 }, providerID: "u", modelID: "old-user" },
      { id: "ses_2", role: "user", time: { created: 2000 }, providerID: "u", modelID: "new-user" },
    ]
    expect(pickLatestModelString(metas)).toBe("u/new-user")
  })

  it("breaks created ties by the lexicographically greatest id", () => {
    const metas = [
      { id: "ses_a", time: { created: 500 }, providerID: "p", modelID: "from-a" },
      { id: "ses_b", time: { created: 500 }, providerID: "p", modelID: "from-b" },
    ]
    expect(pickLatestModelString(metas)).toBe("p/from-b")
  })

  it("treats a missing or non-numeric time.created as zero", () => {
    const metas = [
      { id: "ses_ts", time: { created: "9999" }, providerID: "p", modelID: "no-timestamp" },
      { id: "ses_dated", time: { created: 50 }, providerID: "p", modelID: "dated" },
    ]
    expect(pickLatestModelString(metas)).toBe("p/dated")
    expect(pickLatestModelString([{ id: "ses_x", providerID: "p", modelID: "only" }])).toBe("p/only")
  })

  it("extracts the model through the nested record form", () => {
    const metas = [{ id: "ses_1", time: { created: 10 }, model: { providerID: "openai", modelID: "gpt-4o" } }]
    expect(pickLatestModelString(metas)).toBe("openai/gpt-4o")
  })
})
