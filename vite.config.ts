import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { PrActionName } from './server/github.mjs'
import { PR_ACTIONS, prAction } from './server/github.mjs'
import { jiraTransition, jiraTransitions } from './server/jira.mjs'
import { readKit } from './server/kit.mjs'
import { readStandup } from './server/standup.mjs'
import { PULLABLE, loadConfig, pullReport } from './server/reports.mjs'


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
  return {
    name: 'reporto-pull',
    configureServer(server) {
      server.middlewares.use('/api/pull', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const kind = (req.url ?? '/').split('?')[0].replace(/^\//, '')

        if (req.method === 'GET' && kind === '') {
          res.end(JSON.stringify({ kinds: PULLABLE }))
          return
        }
        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `pull blocked: ${blocked}` }))
          return
        }
        if (!PULLABLE.includes(kind)) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: `no API puller for "${kind}"` }))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('{"error":"use POST"}')
          return
        }

        // The pull itself, the file it writes and the index bookkeeping all live in
        // server/reports.mjs, so `npm run pull` from cron does exactly what this button does.
        void pullReport(kind).then(
          (result) => res.end(JSON.stringify({ ok: true, ...result, writes: [kind] })),
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

/**
 * What moved since the last working day, for the stand-up note. GET only, and read-only
 * against Jira and GitHub.
 */
function standupPlugin(): Plugin {
  return {
    name: 'reporto-standup',
    configureServer(server) {
      server.middlewares.use('/api/standup', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('{"error":"use GET"}')
          return
        }
        const config = loadConfig()
        void readStandup({
          jiraSite: config.jiraSite,
          jiraEmail: process.env.JIRA_EMAIL,
          jiraApiToken: process.env.JIRA_API_TOKEN,
          jiraStatsJql: config.jiraStatsJql,
          githubAuthor: config.githubAuthor ?? '',
          githubOrg: config.githubOrg ?? '',
          githubAccount: config.githubAccount,
        }).then(
          (body) => res.end(JSON.stringify(body)),
          (err: Error) => {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          },
        )
      })
    },
  }
}

/**
 * The commands and skills this machine has, read from ~/.claude at request time. GET only:
 * it reads local files and writes nothing, so the cross-site guard has nothing to protect.
 */
function kitPlugin(): Plugin {
  return {
    name: 'reporto-kit',
    configureServer(server) {
      server.middlewares.use('/api/kit', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('{"error":"use GET"}')
          return
        }
        try {
          res.end(JSON.stringify(readKit({ projectDir: __dirname })))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
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
      kitPlugin(),
      standupPlugin(),
      refreshPlugin(),
      pullPlugin(),
      prActionPlugin(),
      jiraTransitionPlugin(),
    ],
  }
})
