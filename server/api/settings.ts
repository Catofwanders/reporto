import type { Plugin } from 'vite'
import { loadConfig } from '../reports.mjs'
import { capabilities, setEnabled, setSecret } from '../capabilities.mjs'
import { readBody, rejectCrossSite } from './guard.js'

/**
 * Settings the server owns: which modules are on, and which credentials exist.
 *
 * Reading is safe — it answers "set or unset", never a value, because the browser has no use
 * for a token it cannot spend. Writing is the sharp edge: this endpoint puts a secret on
 * disk, so it takes the cross-site guard, refuses any variable not on the writable list, and
 * checks the value's shape before believing it. It exists only in the dev server; a
 * production build is a static site with no API at all.
 */
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
              /*
               * Extra phrases that make a Slack message an ask or a closer. Committed code
               * knows English requests and acknowledgements; a workspace that says "готово"
               * needs to be able to say so without a patch, and its words are nobody else's
               * business either.
               */
              slackWords: {
                ask: config.slackAskWords ?? [],
                closer: config.slackCloserWords ?? [],
              },
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
        }, (reason, status) => {
          res.statusCode = status
          res.end(JSON.stringify({ error: reason }))
        })
      })
    },
  }
}
