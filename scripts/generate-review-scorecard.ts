import * as fs from "node:fs"
import * as path from "node:path"

import {
  areRequiredSignalsComplete,
  buildReviewScorecardFromChecks,
  type GitHubCheckRun,
} from "../src/review/check-run-scorecard"

type CliArgs = {
  repository: string
  headSha: string
  pullRequestUrl?: string
  outputPath?: string
  pollIntervalMs: number
  timeoutMs: number
  autoApproveAllowed: boolean
  pullRequestNumber?: string
}

type GitHubCheckRunsResponse = {
  total_count?: number
  check_runs?: Array<{
    name?: string
    status?: string
    conclusion?: string | null
    details_url?: string | null
    app?: {
      slug?: string | null
      name?: string | null
    } | null
  }>
}

type GitHubApiResponse<T> = {
  data: T
  headers: Headers
}

type GitHubPullRequestResponse = {
  html_url?: string
  draft?: boolean
  head?: {
    sha?: string
    repo?: {
      full_name?: string
    } | null
  } | null
}

function readArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) {
    return undefined
  }

  return args[index + 1]
}

function readBooleanArg(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }

  return value === "true"
}

function readNumberArg(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric argument: ${value}`)
  }

  return parsed
}

function parseArgs(argv: string[]): CliArgs {
  const repository = readArgValue(argv, "--repository")
  const headSha = readArgValue(argv, "--head-sha")
  const pullRequestNumber = readArgValue(argv, "--pull-request-number")

  if (!repository) {
    throw new Error("Missing required argument --repository")
  }

  if (!headSha && !pullRequestNumber) {
    throw new Error("Provide either --head-sha or --pull-request-number")
  }

  return {
    repository,
    headSha: headSha ?? "",
    pullRequestUrl: readArgValue(argv, "--pull-request-url"),
    outputPath: readArgValue(argv, "--output"),
    pollIntervalMs: readNumberArg(readArgValue(argv, "--poll-interval-ms"), 15000),
    timeoutMs: readNumberArg(readArgValue(argv, "--timeout-ms"), 900000),
    autoApproveAllowed: readBooleanArg(readArgValue(argv, "--auto-approve-allowed"), true),
    pullRequestNumber,
  }
}

async function fetchGitHubJson<T>(url: string, token: string): Promise<GitHubApiResponse<T>> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${url}: ${await response.text()}`)
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
  }
}

function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null
  }

  const segments = linkHeader.split(",")
  for (const segment of segments) {
    const trimmed = segment.trim()
    const match = trimmed.match(/^<([^>]+)>;\s*rel="([^"]+)"$/)
    if (match?.[2] === "next") {
      return match[1]
    }
  }

  return null
}

async function resolvePullRequestContext(args: CliArgs, token: string): Promise<CliArgs> {
  if (!args.pullRequestNumber) {
    return args
  }

  const { data: pullRequest } = await fetchGitHubJson<GitHubPullRequestResponse>(
    `https://api.github.com/repos/${args.repository}/pulls/${args.pullRequestNumber}`,
    token,
  )

  const resolvedHeadSha = pullRequest.head?.sha
  if (!resolvedHeadSha) {
    throw new Error(`Unable to resolve head SHA for pull request #${args.pullRequestNumber}`)
  }

  const sameRepository = pullRequest.head?.repo?.full_name === args.repository

  return {
    ...args,
    headSha: resolvedHeadSha,
    pullRequestUrl: pullRequest.html_url ?? args.pullRequestUrl,
    autoApproveAllowed: args.autoApproveAllowed && !Boolean(pullRequest.draft) && sameRepository,
  }
}

async function fetchCheckRuns(repository: string, headSha: string, token: string): Promise<GitHubCheckRun[]> {
  const checkRuns: GitHubCheckRun[] = []
  let nextUrl: string | null = `https://api.github.com/repos/${repository}/commits/${headSha}/check-runs?filter=latest&per_page=100`

  while (nextUrl) {
    const { data: response, headers } = await fetchGitHubJson<GitHubCheckRunsResponse>(nextUrl, token)
    checkRuns.push(
      ...(response.check_runs ?? []).map((checkRun) => ({
        name: checkRun.name ?? "unknown",
        status: checkRun.status ?? "queued",
        conclusion: checkRun.conclusion ?? null,
        detailsUrl: checkRun.details_url ?? null,
        app: checkRun.app ?? null,
      })),
    )
    nextUrl = getNextPageUrl(headers.get("link"))
  }

  return checkRuns
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRequiredChecks(args: CliArgs, token: string): Promise<{ checkRuns: GitHubCheckRun[]; timedOut: boolean }> {
  const deadline = Date.now() + args.timeoutMs
  let lastCheckRuns: GitHubCheckRun[] = []

  while (true) {
    lastCheckRuns = await fetchCheckRuns(args.repository, args.headSha, token)

    if (areRequiredSignalsComplete({
      build: lastCheckRuns.find((checkRun) => checkRun.name.trim().toLowerCase() === "build") ?? null,
      test: lastCheckRuns.find((checkRun) => checkRun.name.trim().toLowerCase() === "test") ?? null,
      security: lastCheckRuns.filter((checkRun) => {
        const name = checkRun.name.trim().toLowerCase()
        const appSlug = checkRun.app?.slug?.trim().toLowerCase()
        return name === "codeql" || name.startsWith("analyze") || appSlug === "github-code-scanning"
      }),
    })) {
      return { checkRuns: lastCheckRuns, timedOut: false }
    }

    if (Date.now() >= deadline) {
      return { checkRuns: lastCheckRuns, timedOut: true }
    }

    await sleep(args.pollIntervalMs)
  }
}

function writeOutput(scorecard: unknown, outputPath: string | undefined): void {
  const contents = `${JSON.stringify(scorecard, null, 2)}\n`
  if (!outputPath) {
    process.stdout.write(contents)
    return
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, contents, "utf8")
  process.stdout.write(contents)
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required")
  }

  const initialArgs = parseArgs(process.argv.slice(2))
  const args = await resolvePullRequestContext(initialArgs, token)
  const { checkRuns, timedOut } = await waitForRequiredChecks(args, token)

  const scorecard = buildReviewScorecardFromChecks({
    repository: args.repository,
    headSha: args.headSha,
    pullRequestUrl: args.pullRequestUrl,
    autoApproveAllowed: args.autoApproveAllowed,
    timedOut,
    checkRuns,
  })

  writeOutput(scorecard, args.outputPath)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
