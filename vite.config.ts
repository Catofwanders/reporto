import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { PrActionName } from './server/github.mjs'
import { PR_ACTIONS, prAction, pullOpenPrs } from './server/github.mjs'

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
  commandGroups: CommandGroup[]
}

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

  const PULLERS: Record<string, (c: ReportoConfig) => Promise<{ date: string }>> = {
    prs: (c) =>
      pullOpenPrs({
        author: c.githubAuthor ?? '',
        org: c.githubOrg ?? '',
        jiraBrowseUrl: c.jiraBrowseUrl ?? '',
        account: c.githubAccount,
        pinnedRepos: c.pinnedRepos ?? [],
      }),
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

// A crash mid-write would leave a truncated day file, so write beside it and rename.
function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

// Tiny file-backed API so the client can persist daily report DBs to db/<date>.json.
// Dev-server only: production build has no write API.
function dbPlugin(): Plugin {
  const dbDir = path.resolve(__dirname, 'db')
  return {
    name: 'reporto-db',
    configureServer(server) {
      fs.mkdirSync(dbDir, { recursive: true })
      server.middlewares.use('/api/db', (req, res) => {
        const name = (req.url ?? '/').split('?')[0].replace(/^\//, '')
        res.setHeader('Content-Type', 'application/json')

        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `write blocked: ${blocked}` }))
          return
        }

        if (req.method === 'GET' && name === '') {
          const days = fs
            .readdirSync(dbDir)
            .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
            .map((f) => f.replace('.json', ''))
            .sort()
          res.end(JSON.stringify(days))
          return
        }

        // POST /api/db/<date>/reconcile — add rows for report items that have no todo
        // yet (a same-day mail refresh brings new items), never touching existing flags.
        const reconcileMatch = name.match(/^(\d{4}-\d{2}-\d{2})\/reconcile$/)
        if (reconcileMatch && req.method === 'POST') {
          const file = path.join(dbDir, `${reconcileMatch[1]}.json`)
          if (!fs.existsSync(file)) {
            res.statusCode = 404
            res.end('{"error":"day not found"}')
            return
          }
          readBody(req, (body) => {
            try {
              const incoming = JSON.parse(body) as {
                todos: { id: string; label: string; action: string | null }[]
              }
              const db = JSON.parse(fs.readFileSync(file, 'utf8'))
              db.todos = db.todos ?? []
              const known = new Set(db.todos.map((t: { id: string }) => t.id))
              let added = 0
              for (const row of incoming.todos ?? []) {
                if (known.has(row.id)) continue
                db.todos.push({ ...row, checked: false, deleted: false, checkedAt: null })
                known.add(row.id)
                added++
              }
              if (added) writeJsonAtomic(file, db)
              res.end(JSON.stringify({ added, todos: db.todos }))
            } catch (err) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: `invalid reconcile body: ${String(err)}` }))
            }
          })
          return
        }

        // POST /api/db/<date>/todo — merge one todo patch into the day file
        // (whole-doc PUT from a stale tab must never clobber other todos)
        const todoMatch = name.match(/^(\d{4}-\d{2}-\d{2})\/todo$/)
        if (todoMatch && req.method === 'POST') {
          const file = path.join(dbDir, `${todoMatch[1]}.json`)
          if (!fs.existsSync(file)) {
            res.statusCode = 404
            res.end('{"error":"day not found"}')
            return
          }
          readBody(req, (body) => {
            try {
              const patch = JSON.parse(body) as {
                id: string
                checked?: boolean
                deleted?: boolean
                checkedAt?: string | null
              }
              const db = JSON.parse(fs.readFileSync(file, 'utf8'))
              const todo = (db.todos ?? []).find((t: { id: string }) => t.id === patch.id)
              if (!todo) {
                res.statusCode = 404
                res.end('{"error":"todo not found"}')
                return
              }
              if (patch.checked !== undefined) todo.checked = patch.checked
              if (patch.deleted !== undefined) todo.deleted = patch.deleted
              if (patch.checkedAt !== undefined) todo.checkedAt = patch.checkedAt
              writeJsonAtomic(file, db)
              res.end(JSON.stringify(todo))
            } catch {
              res.statusCode = 400
              res.end('{"error":"invalid json"}')
            }
          })
          return
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) {
          res.statusCode = 400
          res.end('{"error":"expected /api/db/<YYYY-MM-DD>"}')
          return
        }
        const file = path.join(dbDir, `${name}.json`)

        if (req.method === 'GET') {
          if (!fs.existsSync(file)) {
            res.statusCode = 404
            res.end('{"error":"not found"}')
            return
          }
          res.end(fs.readFileSync(file, 'utf8'))
          return
        }

        if (req.method === 'PUT') {
          readBody(req, (body) => {
            let parsed: unknown
            try {
              parsed = JSON.parse(body)
            } catch {
              res.statusCode = 400
              res.end('{"error":"invalid json"}')
              return
            }
            writeJsonAtomic(file, parsed)
            res.end('{"ok":true}')
          })
          return
        }

        res.statusCode = 405
        res.end('{"error":"method not allowed"}')
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Loopback only: the dev server exposes file writes and agent runs, so it must not
  // be reachable from the LAN.
  server: { host: '127.0.0.1' },
  plugins: [react(), dbPlugin(), refreshPlugin(), pullPlugin(), prActionPlugin()],
})
