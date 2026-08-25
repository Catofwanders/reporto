import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { PrActionName } from './server/github.mjs'
import { PR_ACTIONS, prAction, pullOpenPrs, pullTicketPrs } from './server/github.mjs'
import { jiraTransition, jiraTransitions, pullJira } from './server/jira.mjs'
import { pullStats } from './server/stats.mjs'
import { pullGoogleCalendar } from './server/googleCalendar.mjs'

// Personal / employer-specific settings live in ./config (gitignored). The committed
// config.template is the fallback, so a fresh checkout still boots.
interface CommandGroup {
  command: string
  writes: string[]
  tools: 'jira'
}

interface ReportoConfig {
  githubOrg?: string
  /** GitHub login whose PRs the dashboard reports on. */
  githubAuthor?: string
  /** gh keyring account to pin — org repos 404 under the wrong active account. */
  githubAccount?: string
  /** e.g. https://your-site.atlassian.net/browse — used to link tickets. */
  jiraBrowseUrl?: string
  /** Repo names pinned to the top of the open-PR list, in the order given. */
  pinnedRepos?: string[]
  /** Jira site root, e.g. https://your-site.atlassian.net */
  jiraSite?: string
  /** JQL for the tickets the dashboard should show. */
  jiraJql?: string
  /** Regex source matching a ticket key in a PR title, e.g. "\\bDTP-\\d+\\b". */
  ticketPattern?: string
  /** Statuses worth one extra PR body search when no PR title named the ticket. */
  fallbackStatuses?: string[]
  /** Calendar addresses to read. A service account needs these; it cannot enumerate. */
  calendarIds?: string[]
  /** Calendar names to pull; empty means every calendar the account can read. */
  calendars?: string[]
  /** Calendar names to skip — birthdays, holidays, anything that is noise. */
  calendarsExcluded?: string[]
  /** How far the calendar watch-list looks ahead. */
  upcomingDays?: number
  /** Statuses the dashboard offers when changing a ticket. Empty means the whole workflow. */
  statusChoices?: string[]
  /** JQL prefix the monthly stats are built on. Defaults to `assignee = currentUser()`. */
  jiraStatsJql?: string
  /** Status names the stats count transitions into, when this site names them differently. */
  statsStatuses?: {
    releaseReady?: string
    deployed?: string
    qcReady?: string
    qcFailed?: string
    inProgress?: string
  }
  /** How many months the stats report carries, newest first. Defaults to 6. */
  statsMonths?: number
  commandGroups: CommandGroup[]
}

/** Where an unmatched ticket is worth a per-ticket PR search; backlog items are not. */
const DEFAULT_FALLBACK_STATUSES = ['in progress', 'code review', 'qc ready', 'blocked']

/** Everything not Done and not already released, freshest first. */
const DEFAULT_JQL =
  'assignee = currentUser() AND statusCategory != Done ORDER BY status ASC, updated DESC'

function loadConfig(): ReportoConfig {
  for (const dir of ['config', 'config.template']) {
    const file = path.resolve(__dirname, dir, 'reporto.json')
    if (!fs.existsSync(file)) continue
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as ReportoConfig
    } catch (err) {
      console.warn(`[reporto] ignoring unreadable ${dir}/reporto.json: ${String(err)}`)
    }
  }
  return { commandGroups: [] }
}

// A headless `claude -p` run cannot prompt for permission, so every tool the skill
// needs is allow-listed here. Scoped to these runs — no repo-wide settings change.
function buildToolLists(githubOrg: string | undefined) {
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
function buildRefreshCommands() {
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

const REFRESH_COMMANDS = buildRefreshCommands()

const RUN_TIMEOUT_MS = 15 * 60 * 1000

// Any page in the browser can POST to a localhost dev server, and here that would
// start a Claude agent run with pre-granted tools. Two barriers a cross-origin
// "simple" request cannot clear: an Origin matching our own host, and a custom
// header (which forces a preflight the middleware never answers).
const WRITE_HEADER = 'x-reporto-write'

function rejectCrossSite(req: { method?: string; headers: Record<string, unknown> }) {
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
function refreshPlugin(): Plugin {
  const running = new Map<string, Promise<unknown>>()

  return {
    name: 'reporto-refresh',
    configureServer(server) {
      server.middlewares.use('/api/refresh', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const kind = (req.url ?? '/').split('?')[0].replace(/^\//, '')

        // The client needs the kind → command map to know which cards a single run
        // covers; without it a sibling card reports its own run as a 409 failure.
        if (req.method === 'GET' && kind === '') {
          const commandOf: Record<string, string> = {}
          for (const [k, entry] of Object.entries(REFRESH_COMMANDS)) {
            commandOf[k] = entry.command
          }
          res.end(JSON.stringify({ running: [...running.keys()], commandOf }))
          return
        }

        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `refresh blocked: ${blocked}` }))
          return
        }

        const entry = REFRESH_COMMANDS[kind]
        if (!entry) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: `unknown report "${kind}"` }))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('{"error":"use POST"}')
          return
        }
        // One run per command, so two cards backed by the same command can't collide.
        const lockKey = entry.command
        if (running.has(lockKey)) {
          res.statusCode = 409
          res.end(JSON.stringify({ error: `${entry.command} is already running` }))
          return
        }

        // A skill that cannot do its job may still exit 0 after explaining why (the mail
        // skill does exactly that when the Chrome extension is absent). Exit status alone
        // would report success while nothing changed, so compare the report files too.
        const reportsDir = path.resolve(__dirname, 'public/reports')
        const stamps = (kinds: string[]) =>
          kinds.map((kind) => {
            if (!fs.existsSync(reportsDir)) return `${kind}:none`
            const newest = fs
              .readdirSync(reportsDir)
              .filter((f) => f.startsWith(`${kind}-`) && f.endsWith('.json'))
              .map((f) => fs.statSync(path.join(reportsDir, f)).mtimeMs)
              .sort((a, b) => b - a)[0]
            return `${kind}:${newest ?? 'none'}`
          })
        const before = stamps(entry.writes)

        const started = Date.now()
        const run = new Promise<{ code: number | null; out: string }>((resolve) => {
          const child = spawn(
            'claude',
            ['-p', entry.command, '--allowedTools', ...entry.allowedTools],
            { cwd: __dirname, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
          )
          let out = ''
          let settled = false
          // Resolve on the timeout too: a child that ignores SIGTERM must not hold the
          // lock (and the HTTP response) open forever.
          const settle = (code: number | null, extra = '') => {
            if (settled) return
            settled = true
            resolve({ code, out: out + extra })
          }
          const collect = (chunk: Buffer) => {
            out += chunk.toString()
            if (out.length > 20_000) out = out.slice(-20_000)
          }
          child.stdout.on('data', collect)
          child.stderr.on('data', collect)
          const timer = setTimeout(() => {
            child.kill('SIGTERM')
            const kill9 = setTimeout(() => child.kill('SIGKILL'), 10_000)
            kill9.unref?.()
            settle(null, `\n[reporto] timed out after ${RUN_TIMEOUT_MS / 60000} min`)
          }, RUN_TIMEOUT_MS)
          child.on('error', (err) => {
            clearTimeout(timer)
            settle(null, `\n[reporto] spawn failed: ${err.message}`)
          })
          child.on('close', (code) => {
            clearTimeout(timer)
            settle(code)
          })
        }).finally(() => running.delete(lockKey))

        running.set(lockKey, run)
        void run.then(({ code, out }) => {
          const wrote = stamps(entry.writes).some((s, i) => s !== before[i])
          const ok = code === 0 && wrote
          const reason =
            code !== 0
              ? `${entry.command} exited ${code}`
              : wrote
                ? undefined
                : `${entry.command} finished without writing any report — see the log`
          res.statusCode = ok ? 200 : 500
          res.end(
            JSON.stringify({
              ok,
              error: reason,
              kind,
              command: entry.command,
              writes: entry.writes,
              exitCode: code,
              wrote,
              durationMs: Date.now() - started,
              log: out.slice(-4000),
            }),
          )
        })
      })
    },
  }
}

// Pull API: POST /api/pull/<kind> fetches a report straight from the upstream API, no
// agent run involved. One GraphQL call replaces the skill's search-plus-per-PR calls, so
// this answers in about a second and the caller controls exactly what is fetched.
function pullPlugin(): Plugin {
  const reportsDir = path.resolve(__dirname, 'public/reports')

  /** The report currently on disk for a kind, or null when there is none to carry over. */
  const readReport = (kind: string) => {
    try {
      const indexFile = path.join(reportsDir, 'index.json')
      if (!fs.existsSync(indexFile)) return null
      const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as {
        latest?: Record<string, string>
      }
      const file = index.latest?.[kind]
      if (!file) return null
      const at = path.join(reportsDir, file)
      if (!fs.existsSync(at)) return null
      return JSON.parse(fs.readFileSync(at, 'utf8')) as { events?: never[] }
    } catch {
      // A report we cannot read is one we cannot carry over; the pull still runs.
      return null
    }
  }

  const PULLERS: Record<string, (c: ReportoConfig) => Promise<{ date: string }>> = {
    // Settled months are read back from the last report instead of being recomputed: the
    // cycle-time medians cost one changelog request per ticket, and a month that has ended
    // cannot change.
    stats: (c) =>
      pullStats({
        jiraSite: c.jiraSite,
        jiraEmail: process.env.JIRA_EMAIL,
        jiraApiToken: process.env.JIRA_API_TOKEN,
        jiraStatsJql: c.jiraStatsJql,
        statsStatuses: c.statsStatuses,
        githubAuthor: c.githubAuthor ?? '',
        githubOrg: c.githubOrg ?? '',
        githubAccount: c.githubAccount,
        calendar: {
          serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
          calendarIds: c.calendarIds ?? [],
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
          include: c.calendars ?? [],
          exclude: c.calendarsExcluded ?? [],
        },
        months: c.statsMonths ?? 6,
        previous: readReport('stats') as Parameters<typeof pullStats>[0]['previous'],
      }),
    prs: (c) =>
      pullOpenPrs({
        author: c.githubAuthor ?? '',
        org: c.githubOrg ?? '',
        jiraBrowseUrl: c.jiraBrowseUrl ?? '',
        account: c.githubAccount,
        pinnedRepos: c.pinnedRepos ?? [],
      }),
    calendar: (c) => {
      // Outlook is only readable through the Chrome extension, so whatever the last /email
      // run put in the report is read back and carried over — otherwise a calendar pull
      // would drop the stand-up that lives only there.
      const previous = readReport('calendar')
      return pullGoogleCalendar({
        serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        calendarIds: c.calendarIds ?? [],
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        include: c.calendars ?? [],
        exclude: c.calendarsExcluded ?? [],
        upcomingDays: c.upcomingDays ?? 7,
        keepEvents: previous?.events ?? [],
      })
    },
    jira: (c) => {
      const fallbackStatuses = (c.fallbackStatuses ?? DEFAULT_FALLBACK_STATUSES).map((s) =>
        s.toLowerCase(),
      )
      return pullJira({
        site: c.jiraSite,
        email: process.env.JIRA_EMAIL,
        apiToken: process.env.JIRA_API_TOKEN,
        jql: c.jiraJql ?? DEFAULT_JQL,
        jiraBrowseUrl: c.jiraBrowseUrl,
        resolvePrs: c.githubAuthor
          ? (tickets) =>
              pullTicketPrs({
                author: c.githubAuthor ?? '',
                org: c.githubOrg ?? '',
                ticketPattern: c.ticketPattern ?? '\\b[A-Z][A-Z0-9]+-\\d+\\b',
                account: c.githubAccount,
                fallbackKeys: tickets
                  .filter((t) => fallbackStatuses.includes(t.status.toLowerCase()))
                  .map((t) => t.key),
              })
          : undefined,
      })
    },
  }

  return {
    name: 'reporto-pull',
    configureServer(server) {
      server.middlewares.use('/api/pull', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const kind = (req.url ?? '/').split('?')[0].replace(/^\//, '')

        if (req.method === 'GET' && kind === '') {
          res.end(JSON.stringify({ kinds: Object.keys(PULLERS) }))
          return
        }
        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `pull blocked: ${blocked}` }))
          return
        }
        const puller = PULLERS[kind]
        if (!puller) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: `no API puller for "${kind}"` }))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('{"error":"use POST"}')
          return
        }

        const started = Date.now()
        const config = loadConfig()
        if (!config.githubAuthor || !config.githubOrg) {
          res.statusCode = 400
          res.end(
            JSON.stringify({
              error: 'set githubAuthor and githubOrg in config/reporto.json (see config.template)',
            }),
          )
          return
        }

        void puller(config).then(
          (report) => {
            const file = `${kind}-${report.date}.json`
            fs.mkdirSync(reportsDir, { recursive: true })
            writeJsonAtomic(path.join(reportsDir, file), report)

            // Point the dashboard at the file just written, and keep the day in history.
            const indexFile = path.join(reportsDir, 'index.json')
            const index = fs.existsSync(indexFile)
              ? JSON.parse(fs.readFileSync(indexFile, 'utf8'))
              : { latest: {}, history: [] }
            index.latest[kind] = file
            let day = index.history.find((h: { date: string }) => h.date === report.date)
            if (!day) {
              day = { date: report.date }
              index.history.unshift(day)
            }
            day[kind] = file
            writeJsonAtomic(indexFile, index)

            res.end(
              JSON.stringify({ ok: true, kind, file, writes: [kind], durationMs: Date.now() - started }),
            )
          },
          (err: Error) => {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, kind, error: err.message }))
          },
        )
      })
    },
  }
}

// Jira transition API: GET /api/jira/<KEY>/transitions lists what the workflow allows now,
// POST /api/jira/<KEY>/transition applies one. This writes to a shared board, so the key
// is validated against the configured ticket pattern and the transition id comes from the
// list Jira itself just returned — the request never names a status string.
function jiraTransitionPlugin(): Plugin {
  const KEY = /^[A-Z][A-Z0-9]*-\d+$/

  return {
    name: 'reporto-jira-transition',
    configureServer(server) {
      server.middlewares.use('/api/jira', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const parts = (req.url ?? '/').split('?')[0].replace(/^\//, '').split('/')
        const [key, verb] = parts
        if (!key || !KEY.test(key)) {
          res.statusCode = 400
          res.end('{"error":"expected /api/jira/<TICKET-KEY>/transitions"}')
          return
        }

        const config = loadConfig()
        const creds = {
          site: config.jiraSite,
          email: process.env.JIRA_EMAIL,
          apiToken: process.env.JIRA_API_TOKEN,
          key,
          allow: config.statusChoices ?? [],
        }

        if (req.method === 'GET' && verb === 'transitions') {
          void jiraTransitions(creds).then(
            (transitions) => res.end(JSON.stringify({ ok: true, key, transitions })),
            (err: Error) => {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, key, error: err.message }))
            },
          )
          return
        }

        if (req.method !== 'POST' || verb !== 'transition') {
          res.statusCode = 405
          res.end('{"error":"use GET <key>/transitions or POST <key>/transition"}')
          return
        }

        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `transition blocked: ${blocked}` }))
          return
        }

        readBody(req, (body) => {
          let transitionId: string
          try {
            transitionId = String((JSON.parse(body || '{}') as { transitionId?: string }).transitionId ?? '')
          } catch {
            res.statusCode = 400
            res.end('{"error":"body must be JSON"}')
            return
          }
          if (!/^\d+$/.test(transitionId)) {
            res.statusCode = 400
            res.end('{"error":"transitionId must be one of the ids from <key>/transitions"}')
            return
          }
          void jiraTransition({ ...creds, transitionId }).then(
            (result) => res.end(JSON.stringify({ ok: true, ...result })),
            (err: Error) => {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, key, error: err.message }))
            },
          )
        })
      })
    },
  }
}

// PR action API: POST /api/pr/<repo>/<num>/<action> flips one pull request's state.
// Write actions on someone's real repository, so the URL selects a known action from a
// fixed list and the org comes from config — the request never names a command.
function prActionPlugin(): Plugin {
  return {
    name: 'reporto-pr-action',
    configureServer(server) {
      server.middlewares.use('/api/pr', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify({ actions: PR_ACTIONS }))
          return
        }
        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `action blocked: ${blocked}` }))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('{"error":"use POST"}')
          return
        }

        const parts = (req.url ?? '/').split('?')[0].replace(/^\//, '').split('/')
        const [repo, numRaw, actionRaw] = parts
        const num = Number(numRaw)
        const action = actionRaw as PrActionName
        if (!repo || !Number.isInteger(num) || !action) {
          res.statusCode = 400
          res.end('{"error":"expected /api/pr/<repo>/<number>/<action>"}')
          return
        }
        if (!PR_ACTIONS.includes(action)) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: `unknown action "${action}"`, actions: PR_ACTIONS }))
          return
        }

        const config = loadConfig()
        if (!config.githubOrg) {
          res.statusCode = 400
          res.end('{"error":"set githubOrg in config/reporto.json"}')
          return
        }

        void prAction({
          owner: config.githubOrg,
          repo,
          num,
          action,
          account: config.githubAccount ?? config.githubAuthor,
        }).then(
          (result) => res.end(JSON.stringify({ ok: true, action, ...result })),
          (err: Error) => {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, action, repo, num, error: err.message }))
          },
        )
      })
    },
  }
}

// Cap request bodies: these endpoints only ever receive small JSON documents.
const MAX_BODY_BYTES = 1_000_000

function readBody(
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

// A crash mid-write would leave a truncated report file, so write beside it and rename.
function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars, and only to the client. The pullers run in
  // this process and need the raw ones, so lift .env into the environment by hand.
  for (const [key, value] of Object.entries(loadEnv(mode, __dirname, ''))) {
    // An empty var is as good as unset here: a placeholder line left blank in .env must
    // not win over a value filled in later, which `??=` would have let it do.
    if (!process.env[key]) process.env[key] = value
  }

  return {
    // Loopback only: the dev server exposes file writes and agent runs, so it must not
    // be reachable from the LAN.
    server: { host: '127.0.0.1' },
    plugins: [
      react(),
      refreshPlugin(),
      pullPlugin(),
      prActionPlugin(),
      jiraTransitionPlugin(),
    ],
  }
})
