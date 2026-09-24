import { describe, it, expect } from "vitest"
import { parseSupervisorQueueResponse } from "../ui/hooks/useSupervisorQueue"
import type { SupervisorQueuePayload } from "../types"

// ---------------------------------------------------------------------------
// useSupervisorQueue: test the pure response parser (the hook lifecycle
// mirrors useAttention's tested setTimeout/AbortController skeleton; no DOM
// test environment exists in this repo, so the polling contract is covered
// here at the parse boundary and via the route test).
// ---------------------------------------------------------------------------

const goodItem = {
  id: "att_123",
  decisionKey: "dk-1",
  kind: "question",
  lifecycleState: "revalidated",
  isResolved: false,
}

const goodBody = {
  ok: true,
  items: [goodItem],
  status: { queueDepths: { "/root": 1 } },
  readAtMs: 1758600000000,
  source: "queue.json",
}

describe("parseSupervisorQueueResponse", () => {
  it("parses an ok:true payload", () => {
    const parsed = parseSupervisorQueueResponse(goodBody)
    expect(parsed).not.toBeNull()
    expect(parsed?.items).toHaveLength(1)
    expect(parsed?.items[0]?.id).toBe("att_123")
    expect(parsed?.source).toBe("queue.json")
    expect(parsed?.readAtMs).toBe(1758600000000)
  })

  it("returns null on an ok:false response (route 503/500 body)", () => {
    expect(parseSupervisorQueueResponse({ ok: false, error: "absent" })).toBeNull()
  })

  it("returns null for malformed shapes", () => {
    expect(parseSupervisorQueueResponse(null)).toBeNull()
    expect(parseSupervisorQueueResponse("nope")).toBeNull()
    expect(parseSupervisorQueueResponse({ ok: true })).toBeNull()
    expect(parseSupervisorQueueResponse({ ok: true, items: {}, readAtMs: 1, source: "queue.json" })).toBeNull()
    expect(parseSupervisorQueueResponse({ ok: true, items: [], readAtMs: "x", source: "queue.json" })).toBeNull()
    expect(
      parseSupervisorQueueResponse({ ok: true, items: [], readAtMs: 1, source: "elsewhere" }),
    ).toBeNull()
  })

  it("maps a non-object status to null and drops non-object items", () => {
    const parsed = parseSupervisorQueueResponse({
      ok: true,
      items: [goodItem, null, 7],
      status: "corrupt",
      readAtMs: 1,
      source: "queue.json",
    })
    expect(parsed?.status).toBeNull()
    expect(parsed?.items).toHaveLength(1)
  })

  it("round-trips a full payload through the type contract", () => {
    const payload: SupervisorQueuePayload = {
      items: [{ ...goodItem, priority: { urgency: 4 } }],
      status: null,
      readAtMs: 5,
      source: "queue.json",
    }
    const parsed = parseSupervisorQueueResponse({ ok: true, ...payload })
    expect(parsed).toEqual(payload)
  })
})
