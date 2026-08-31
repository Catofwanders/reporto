/**
 * What every write endpoint shares.
 *
 * The cross-site guard is the important one: any page in the browser can POST to a localhost
 * dev server, and here that would start an agent run with pre-granted tools. Two barriers a
 * cross-origin "simple" request cannot clear — an `Origin` matching our own host, and a custom
 * header, which forces a preflight the middleware never answers.
 */
import path from 'node:path'
import { loadConfig } from '../reports.mjs'

/** The repo root, two levels up from `server/api`. */
const projectRoot = path.resolve(import.meta.dirname, '../..')

export function buildToolLists(githubOrg: string | undefined) {
  const reportWrite = [
    'Read',
    `Edit(//${path.join(projectRoot, 'public/reports')}/**)`,
    'Bash(jq:*)',
  ]
  return {
    jira: [
      ...reportWrite,
      'mcp__atlassian__searchJiraIssuesUsingJql',
      'Bash(gh search prs:*)',
      'Bash(gh pr view:*)',
      // Without an org the compare API has no permission — see config.template.
      ...(githubOrg ? [`Bash(gh api repos/${githubOrg}/*)`] : []),
    ],
  }
}

// kind (one card) -> the command group that regenerates it
export function buildRefreshCommands() {
  const config = loadConfig()
  const tools = buildToolLists(config.githubOrg)
  const byKind: Record<
    string,
    { command: string; writes: string[]; allowedTools: string[] }
  > = {}
  for (const group of config.commandGroups) {
    for (const kind of group.writes) {
      byKind[kind] = {
        command: group.command,
        writes: group.writes,
        allowedTools: tools[group.tools] ?? tools.jira,
      }
    }
  }
  return byKind
}

export const REFRESH_COMMANDS = buildRefreshCommands()

export const RUN_TIMEOUT_MS = 15 * 60 * 1000

// Any page in the browser can POST to a localhost dev server, and here that would
// start a Claude agent run with pre-granted tools. Two barriers a cross-origin
// "simple" request cannot clear: an Origin matching our own host, and a custom
// header (which forces a preflight the middleware never answers).
const WRITE_HEADER = 'x-reporto-write'

export function rejectCrossSite(req: { method?: string; headers: Record<string, unknown> }) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return null

  const host = req.headers.host as string | undefined
  const origin = req.headers.origin as string | undefined
  if (!host) return 'missing Host header'
  if (!origin) return 'missing Origin header'
  try {
    if (new URL(origin).host !== host) return `origin ${origin} does not match host ${host}`
  } catch {
    return `unparseable Origin: ${origin}`
  }
  if (req.headers[WRITE_HEADER] !== '1') return `missing ${WRITE_HEADER} header`
  return null
}

// Refresh API: POST /api/refresh/<kind> runs the matching slash command through the
// claude CLI, so the dashboard can regenerate one report at a time. Dev-server only.
/**
 * The environment a skill run gets, which is deliberately not this process's.
 *
 * `env: process.env` handed the child every credential the dev server holds — the Slack user
 * token, the Jira token, the Google trio — to a run whose whole job is to write a JSON file,
 * allow-listed to `jq` and the report directory. It cannot need them: anything that talks to an
 * API is on this side of the wall. So it gets what a process needs to exist and nothing else.
 */
export function agentEnv(): NodeJS.ProcessEnv {
  const KEEP = ['PATH', 'HOME', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'USER', 'LOGNAME']
  const env: NodeJS.ProcessEnv = {}
  for (const key of KEEP) if (process.env[key]) env[key] = process.env[key]
  return env
}

export const MAX_BODY_BYTES = 1_000_000

export function readBody(
  req: { on: (event: string, handler: (chunk?: unknown) => void) => void; destroy: () => void },
  done: (body: string) => void,
  /**
   * Called instead of `done` when the body cannot be trusted. Without this an oversized POST
   * destroyed the request and answered nothing at all, so the caller hung until it gave up —
   * and an aborted request (a tab closed mid-reply) had no handler on the stream either.
   */
  fail: (reason: string, status: number) => void = () => {},
) {
  let body = ''
  let settled = false
  const stop = (reason: string, status: number) => {
    if (settled) return
    settled = true
    fail(reason, status)
  }

  req.on('data', (chunk) => {
    if (settled) return
    body += String(chunk)
    if (body.length > MAX_BODY_BYTES) {
      // Answer first, then destroy: destroying emits `aborted` synchronously, which would
      // otherwise win the race and report a generic 400 for what is plainly a 413.
      stop(`body larger than ${MAX_BODY_BYTES} bytes`, 413)
      req.destroy()
    }
  })
  req.on('end', () => {
    if (settled) return
    settled = true
    done(body)
  })
  req.on('error', () => stop('the request ended before the body arrived', 400))
  req.on('aborted', () => stop('the request was aborted', 400))
}
