import * as path from "node:path"

/**
 * Jump the focus viewer window to a session by delegating to
 * scripts/focus-session.sh (FIFO swap into the running viewer, or a
 * detached Alacritty spawn + raise). Runs the script with an argv array —
 * never a shell — so project paths can't inject anything.
 */
const FOCUS_TIMEOUT_MS = 15_000

export type FocusResult = { ok: true; action: string } | { ok: false; error: string }

export async function focusSession(
  projectRoot: string,
  sessionId: string,
  prewarm = false,
): Promise<FocusResult> {
  const script = path.resolve(import.meta.dir, "../../scripts/focus-session.sh")
  const args = prewarm
    ? [script, projectRoot, sessionId, "prewarm"]
    : [script, projectRoot, sessionId]
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => proc.kill(), FOCUS_TIMEOUT_MS)
  const [exitCode, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
  ])
  clearTimeout(timer)
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    return { ok: false, error: stderr.trim() || `focus-session.sh exited with code ${exitCode}` }
  }
  return { ok: true, action: stdout.trim() || "queued" }
}
