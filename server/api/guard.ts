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

const __dirname = path.resolve(import.meta.dirname, '../..')

export function buildToolLists(githubOrg: string | undefined) {
  const reportWrite = [
    'Read',
    `Edit(//${path.join(__dirname, 'public/reports')}/**)`,
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
  req: { on: (ev: string, cb: (chunk?: Buffer) => void) => void; destroy: () => void },
  done: (body: string) => void,
) {
  let body = ''
  let overflow = false
  req.on('data', (chunk) => {
    if (overflow) return
    body += String(chunk)
    if (body.length > MAX_BODY_BYTES) {
      overflow = true
      req.destroy()
    }
  })
  req.on('end', () => {
    if (!overflow) done(body)
  })
}

/**
 * The hand-written map of the work — projects, the ticket workflow, the infrastructure
 * sketch. It lives in config/ rather than public/ because it names an employer's systems and
 * this remote is public, so it needs an endpoint rather than being served as a static file.
 */
/**
 * Settings the server owns: which modules are on, and which credentials exist.
 *
 * Reading is safe — it answers "set or unset", never a value, because the browser has no use
 * for a token it cannot spend. Writing is the sharp edge: this endpoint puts a secret on
 * disk, so it takes the cross-site guard, refuses any variable not on the writable list, and
 * checks the value's shape before believing it. It exists only in the dev server; a
 * production build is a static site with no API at all.
 */
/**
 * Replying to Slack from the dashboard.
 *
 * This is the sharpest endpoint here: a user token posts as the human, in a shared workspace,
 * with no undo. Two things bound it. The destination must already be in the Slack report —
 * the dashboard can answer where I was addressed and nowhere else, so a stray page cannot
 * name an arbitrary channel — and a thread reply must name a thread the report knows. That
 * makes the report the allow-list, which is exactly what "reply from the queue" means.
 *
 * Sending is never automatic: the page confirms the destination and the text with a human
 * before it calls this, and nothing here ever composes a message of its own.
 */
