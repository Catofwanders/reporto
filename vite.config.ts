import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Personal / employer-specific settings live in ./config (gitignored). The committed
// config.template is the fallback, so a fresh checkout still boots.
interface CommandGroup {
  command: string
  writes: string[]
  tools: 'mail' | 'jira'
}

interface ReportoConfig {
  githubOrg?: string
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
      // Without an org the deploy-branch compare has no permission — see config.template.
      ...(githubOrg ? [`Bash(gh api repos/${githubOrg}/*)`] : []),
    ],
    mail: [
      ...reportWrite,
      'mcp__claude-in-chrome__tabs_context_mcp',
      'mcp__claude-in-chrome__tabs_create_mcp',
      'mcp__claude-in-chrome__tabs_close_mcp',
      'mcp__claude-in-chrome__navigate',
      'mcp__claude-in-chrome__computer',
      'mcp__claude-in-chrome__get_page_text',
      'mcp__claude-in-chrome__read_page',
    ],
  }
}

// kind (one card) -> the command group that regenerates it
function buildRefreshCommands() {
  const config = loadConfig()
  const tools = buildToolLists(config.githubOrg)
  const byKind: Record<string, { command: string; writes: string[]; allowedTools: string[] }> = {}
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

        if (req.method === 'GET' && kind === '') {
          res.end(JSON.stringify({ running: [...running.keys()] }))
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

        const started = Date.now()
        const run = new Promise<{ code: number | null; out: string }>((resolve) => {
          const child = spawn(
            'claude',
            ['-p', entry.command, '--allowedTools', ...entry.allowedTools],
            { cwd: __dirname, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
          )
          let out = ''
          const collect = (chunk: Buffer) => {
            out += chunk.toString()
            if (out.length > 20_000) out = out.slice(-20_000)
          }
          child.stdout.on('data', collect)
          child.stderr.on('data', collect)
          const timer = setTimeout(() => {
            child.kill('SIGTERM')
            out += `\n[reporto] killed after ${RUN_TIMEOUT_MS / 60000} min`
          }, RUN_TIMEOUT_MS)
          child.on('error', (err) => {
            clearTimeout(timer)
            resolve({ code: null, out: `${out}\n[reporto] spawn failed: ${err.message}` })
          })
          child.on('close', (code) => {
            clearTimeout(timer)
            resolve({ code, out })
          })
        }).finally(() => running.delete(lockKey))

        running.set(lockKey, run)
        void run.then(({ code, out }) => {
          res.statusCode = code === 0 ? 200 : 500
          res.end(
            JSON.stringify({
              ok: code === 0,
              kind,
              command: entry.command,
              writes: entry.writes,
              exitCode: code,
              durationMs: Date.now() - started,
              log: out.slice(-4000),
            }),
          )
        })
      })
    },
  }
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
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
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
              fs.writeFileSync(file, JSON.stringify(db, null, 2))
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
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              JSON.parse(body)
            } catch {
              res.statusCode = 400
              res.end('{"error":"invalid json"}')
              return
            }
            fs.writeFileSync(file, body)
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
  plugins: [react(), dbPlugin(), refreshPlugin()],
})
