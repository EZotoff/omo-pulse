export const QUESTION_TOOL_NAMES = new Set([
  "question",
  "AskUserQuestion",
  "ask_user_question",
  "askuserquestion",
  "mcp_question",
])

export function isPendingQuestionTool(toolName: string | null | undefined, status: string | null | undefined): boolean {
  return typeof toolName === "string" && status === "pending" && QUESTION_TOOL_NAMES.has(toolName)
}

export const TASK_TOOL_NAMES = new Set([
  "delegate_task",
  "task",
  "call_omo_agent",
  "background_task",
])
