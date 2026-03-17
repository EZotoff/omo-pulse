import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { spawnSync } from "node:child_process"

import { afterEach, describe, expect, it } from "vitest"

type GateRunResult = {
  exitCode: number
  stdout: string
  stderr: string
  outputs: Record<string, string>
  summary: string
}

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-ai-review-gate-"))
  tempDirs.push(dir)
  return dir
}

function parseGitHubOutputs(contents: string): Record<string, string> {
  const outputs: Record<string, string> = {}
  const lines = contents.split("\n")

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }

    const heredocMatch = line.match(/^([^=]+)<<(.+)$/)
    if (heredocMatch) {
      const [, name, delimiter] = heredocMatch
      const valueLines: string[] = []
      index += 1
      while (index < lines.length && lines[index] !== delimiter) {
        valueLines.push(lines[index] ?? "")
        index += 1
      }
      outputs[name] = valueLines.join("\n")
      continue
    }

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) {
      continue
    }

    const name = line.slice(0, equalsIndex)
    const value = line.slice(equalsIndex + 1)
    outputs[name] = value
  }

  return outputs
}

function runGate(input: unknown): GateRunResult {
  const tempDir = makeTempDir()
  const inputPath = path.join(tempDir, "scorecard.json")
  const outputPath = path.join(tempDir, "github-output.txt")
  const summaryPath = path.join(tempDir, "github-summary.md")

  fs.writeFileSync(inputPath, JSON.stringify(input), "utf8")
  fs.writeFileSync(outputPath, "", "utf8")
  fs.writeFileSync(summaryPath, "", "utf8")

  const proc = spawnSync("bun", ["run", "scripts/ai-review-gate.ts", "--input", inputPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
    },
    encoding: "utf8",
  })

  if (proc.error) {
    throw proc.error
  }

  return {
    exitCode: proc.status ?? -1,
    stdout: proc.stdout,
    stderr: proc.stderr,
    outputs: parseGitHubOutputs(fs.readFileSync(outputPath, "utf8")),
    summary: fs.readFileSync(summaryPath, "utf8"),
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("ai-review-gate CLI", () => {
  it("exits 0 for request_fixes while preserving non-blocking outputs", () => {
    const result = runGate({
      summary: "Needs human follow-up",
      source: "unit-test",
      scores: {
        security: 4.8,
        safety: 4.8,
        performance: 4.2,
        featureQuality: 4.9,
        confidence: 4.6,
      },
      risk: "low",
      autoApproveAllowed: true,
      findings: [],
    })

    expect(result.exitCode).toBe(0)
    expect(result.outputs.decision).toBe("request_fixes")
    expect(result.outputs.blocked).toBe("false")
    expect(result.outputs.auto_approve).toBe("false")
    expect(result.summary).toContain("Decision: `request_fixes`")
  })

  it("exits 1 for block decisions", () => {
    const result = runGate({
      summary: "Unsafe change",
      source: "unit-test",
      scores: {
        security: 1.8,
        safety: 4.8,
        performance: 4.8,
        featureQuality: 4.8,
        confidence: 4.6,
      },
      risk: "high",
      autoApproveAllowed: false,
      findings: [],
    })

    expect(result.exitCode).toBe(1)
    expect(result.outputs.decision).toBe("block")
    expect(result.outputs.blocked).toBe("true")
    expect(result.outputs.auto_approve).toBe("false")
  })

  it("exits 0 and emits auto-approve outputs for auto_approve decisions", () => {
    const result = runGate({
      summary: "Ready to merge",
      source: "unit-test",
      scores: {
        security: 4.9,
        safety: 4.9,
        performance: 4.8,
        featureQuality: 4.9,
        confidence: 4.8,
      },
      risk: "low",
      autoApproveAllowed: true,
      findings: [],
    })

    expect(result.exitCode).toBe(0)
    expect(result.outputs.decision).toBe("auto_approve")
    expect(result.outputs.blocked).toBe("false")
    expect(result.outputs.auto_approve).toBe("true")
    expect(result.summary).toContain("Decision: `auto_approve`")
  })

  it("exits 2 and emits blocking outputs for invalid input", () => {
    const result = runGate({
      summary: "Broken scorecard",
      source: "unit-test",
      scores: {
        security: 4.8,
      },
      risk: "low",
      autoApproveAllowed: true,
      findings: [],
    })

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("scores.safety must be a number")
    expect(result.outputs.decision).toBe("block")
    expect(result.outputs.blocked).toBe("true")
    expect(result.outputs.auto_approve).toBe("false")
  })
})
