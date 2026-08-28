import type { Plugin } from 'vite'
import { PULLABLE, pullReport } from '../reports.mjs'
import { capabilityOf } from '../capabilities.mjs'
import { rejectCrossSite } from './guard.js'

export function pullPlugin(): Plugin {
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
        // A module switched off in Settings, or one whose credentials are missing, is not
        // pulled — otherwise the switch would only hide the card while cron and any stale
        // tab kept fetching behind it.
        const capability = capabilityOf(kind)
        if (capability && !(capability.configured && capability.enabled)) {
          res.statusCode = 409
          const why = capability.enabled
            ? `missing ${[...capability.missingEnv, ...capability.missingConfig].join(', ') || 'credentials'}`
            : 'switched off in Settings'
          res.end(JSON.stringify({ ok: false, kind, error: `${capability.label}: ${why}` }))
          return
        }

        // ?phase=fast asks for the cheap half of a two-phase pull; anything else is a full
        // one, which is what cron and every other kind do.
        const phase = /[?&]phase=fast(&|$)/.test(req.url ?? '') ? 'fast' : 'full'

        // The pull itself, the file it writes and the index bookkeeping all live in
        // server/reports.mjs, so `npm run pull` from cron does exactly what this button does.
        void pullReport(kind, undefined, { phase }).then(
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

// Jira ticket API: GET /api/jira/<KEY> reads one issue for the drawer, GET
// /api/jira/<KEY>/transitions lists what the workflow allows now, POST
// /api/jira/<KEY>/transition applies one. The write path touches a shared board, so the key
// is validated against the configured ticket pattern and the transition id comes from the
// list Jira itself just returned — the request never names a status string.
