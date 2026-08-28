import type { Plugin } from 'vite'
import type { PrActionName } from '../github.mjs'
import { PR_ACTIONS, prAction } from '../github.mjs'
import { loadConfig } from '../reports.mjs'
import { rejectCrossSite } from './guard.js'

export function prActionPlugin(): Plugin {
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
