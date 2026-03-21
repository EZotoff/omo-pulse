import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { deriveBackgroundTasks } from "../ingest/background-tasks"
import { getMainSessionView, type OpenCodeStorageRoots, type SessionMetadata, type StoredMessageMeta, type StoredToolPart } from "../ingest/session"

type PersistedToolPart = StoredToolPart & {
  state: StoredToolPart["state"] & {
    metadata?: { sessionId?: string }
    time?: { start?: number }
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8")
}

const tempDirs: string[] = []

function makeTempStorage(): OpenCodeStorageRoots {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-question-"))
  tempDirs.push(root)
  return {
    session: path.join(root, "session"),
    message: path.join(root, "message"),
    part: path.join(root, "part"),
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("background question bridge", () => {
  it("promotes file-based main-session status to question when a background task asks a question", () => {
    const storage = makeTempStorage()
    const nowMs = 1_000_000
    const mainSessionId = "ses-main"
    const questionSessionId = "ses-child-question"
    const runningSessionId = "ses-child-running"
    const mainMessageId = "msg-main"

    const mainMeta: StoredMessageMeta = {
      id: mainMessageId,
      sessionID: mainSessionId,
      role: "assistant",
      time: { created: nowMs - 1_000, completed: nowMs - 900 },
      agent: "build",
    }
    writeJson(path.join(storage.message, mainSessionId, `${mainMessageId}.json`), mainMeta)

    const mainTaskQuestion: PersistedToolPart = {
      id: "part-main-question",
      sessionID: mainSessionId,
      messageID: mainMessageId,
      type: "tool",
      callID: "call-question",
      tool: "background_task",
      state: {
        status: "completed",
        input: {
          description: "Ask the user",
          run_in_background: true,
        },
        metadata: { sessionId: questionSessionId },
        time: { start: nowMs - 1_200 },
      },
    }
    const mainTaskRunning: PersistedToolPart = {
      id: "part-main-running",
      sessionID: mainSessionId,
      messageID: mainMessageId,
      type: "tool",
      callID: "call-running",
      tool: "background_task",
      state: {
        status: "completed",
        input: {
          description: "Keep working",
          run_in_background: true,
        },
        metadata: { sessionId: runningSessionId },
        time: { start: nowMs - 1_100 },
      },
    }
    writeJson(path.join(storage.part, mainMessageId, "0001.json"), mainTaskQuestion)
    writeJson(path.join(storage.part, mainMessageId, "0002.json"), mainTaskRunning)

    const questionMeta: StoredMessageMeta = {
      id: "msg-child-question",
      sessionID: questionSessionId,
      role: "assistant",
      time: { created: nowMs - 200 },
      agent: "atlas",
    }
    writeJson(path.join(storage.message, questionSessionId, "msg-child-question.json"), questionMeta)
    const questionPart: StoredToolPart = {
      id: "part-child-question",
      sessionID: questionSessionId,
      messageID: questionMeta.id,
      type: "tool",
      callID: "child-question",
      tool: "mcp_question",
      state: {
        status: "pending",
        input: {},
      },
    }
    writeJson(path.join(storage.part, questionMeta.id, "0001.json"), questionPart)

    const runningMeta: StoredMessageMeta = {
      id: "msg-child-running",
      sessionID: runningSessionId,
      role: "assistant",
      time: { created: nowMs - 150 },
      agent: "atlas",
    }
    writeJson(path.join(storage.message, runningSessionId, "msg-child-running.json"), runningMeta)
    const runningPart: StoredToolPart = {
      id: "part-child-running",
      sessionID: runningSessionId,
      messageID: runningMeta.id,
      type: "tool",
      callID: "child-running",
      tool: "bash",
      state: {
        status: "running",
        input: {},
      },
    }
    writeJson(path.join(storage.part, runningMeta.id, "0001.json"), runningPart)

    const backgroundTasks = deriveBackgroundTasks({
      storage,
      mainSessionId,
      nowMs,
    })

    expect(backgroundTasks.map((task) => task.status)).toEqual(["question", "running"])

    const sessionMeta: SessionMetadata = {
      id: mainSessionId,
      projectID: "proj-1",
      directory: "/tmp/project",
      time: { created: nowMs - 5_000, updated: nowMs - 1_000 },
    }

    const view = getMainSessionView({
      projectRoot: "/tmp/project",
      sessionId: mainSessionId,
      storage,
      sessionMeta,
      nowMs,
    })

    expect(view.status).toBe("question")
    expect(view.currentTool).toBe("mcp_question")
  })
})
