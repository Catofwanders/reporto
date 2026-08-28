import type { Plugin } from 'vite'
import { loadConfig } from '../reports.mjs'
import { capabilities, setEnabled, setSecret } from '../capabilities.mjs'
import { readBody, rejectCrossSite } from './guard.js'

export function settingsPlugin(): Plugin {
  return {
    name: 'reporto-settings',
    configureServer(server) {
      server.middlewares.use('/api/settings', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const route = (req.url ?? '/').split('?')[0]

        if (req.method === 'GET' && (route === '/' || route === '')) {
          // Alongside the modules, the handful of config values the UI needs to render
          // honestly. Never secrets — thresholds and vocabulary, which the client would
          // otherwise have to hardcode, putting the employer's status names in this repo.
          const config = loadConfig()
          res.end(
            JSON.stringify({
              modules: capabilities(),
              statusAging: config.statusAging ?? {},
              stuckStatuses: config.stuckStatuses ?? [],
              // The board's own words — column order, tones and status groups. Config only:
              // committed code knows universal Jira vocabulary and nothing else.
              statuses: config.statuses ?? {},
            }),
          )
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('{"error":"use POST"}')
          return
        }
        const blocked = rejectCrossSite(req)
        if (blocked) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: `settings write blocked: ${blocked}` }))
          return
        }

        const module = /^\/modules\/([a-z]+)$/.exec(route)
        const secret = /^\/secrets\/([A-Z][A-Z0-9_]*)$/.exec(route)
        if (!module && !secret) {
          res.statusCode = 404
          res.end('{"error":"no such setting"}')
          return
        }

        readBody(req, (raw) => {
          let parsed: { enabled?: boolean; value?: string }
          try {
            parsed = JSON.parse(raw || '{}') as typeof parsed
          } catch {
            res.statusCode = 400
            res.end('{"error":"body is not JSON"}')
            return
          }
          try {
            if (module) {
              const result = setEnabled(module[1], parsed.enabled !== false)
              res.end(JSON.stringify({ ok: true, ...result, modules: capabilities() }))
              return
            }
            // The value is written and forgotten: what comes back is the standing, so the
            // page can say "configured" without ever having held the token.
            const result = setSecret(secret![1], parsed.value ?? '')
            res.end(JSON.stringify({ ok: true, name: result.name, replaced: result.replaced, modules: capabilities() }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
          }
        })
      })
    },
  }
}
