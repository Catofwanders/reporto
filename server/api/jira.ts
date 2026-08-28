import type { Plugin } from 'vite'
import { jiraIssueDetail, jiraTransition, jiraTransitions } from '../jira.mjs'
import { loadConfig } from '../reports.mjs'
import { readBody, rejectCrossSite } from './guard.js'

export function jiraPlugin(): Plugin {
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
          res.end('{"error":"expected /api/jira/<TICKET-KEY>[/transitions]"}')
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

        if (req.method === 'GET' && !verb) {
          // Read-only, so no cross-site guard: this answers with data the page already had
          // the key for, and a GET cannot be made to move a ticket.
          void jiraIssueDetail({
            ...creds,
            browseUrl: config.jiraBrowseUrl,
            tones: config.statuses?.tones ?? {},
          }).then(
            (ticket) => res.end(JSON.stringify({ ok: true, ticket })),
            (err: Error) => {
              res.statusCode = err.message.startsWith('no such ticket') ? 404 : 500
              res.end(JSON.stringify({ ok: false, key, error: err.message }))
            },
          )
          return
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
          res.end('{"error":"use GET <key>, GET <key>/transitions or POST <key>/transition"}')
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
        }, (reason, status) => {
          res.statusCode = status
          res.end(JSON.stringify({ error: reason }))
        })
      })
    },
  }
}

// PR action API: POST /api/pr/<repo>/<num>/<action> flips one pull request's state.
// Write actions on someone's real repository, so the URL selects a known action from a
// fixed list and the org comes from config — the request never names a command.
