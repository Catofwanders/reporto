import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { REFRESH_COMMANDS, RUN_TIMEOUT_MS, agentEnv, rejectCrossSite } from './guard.js'

const __dirname = path.resolve(import.meta.dirname, '../..')

export function refreshPlugin(): Plugin {
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
            { cwd: __dirname, env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
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
