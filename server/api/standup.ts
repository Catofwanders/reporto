import type { Plugin } from 'vite'
import { readStandup } from '../standup.mjs'
import { loadConfig } from '../reports.mjs'

export function standupPlugin(): Plugin {
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
        // Only the two spans exist; anything else is the stand-up rather than an error, since
        // a mistyped query should not cost the note.
        const span = /[?&]span=week(&|$)/.test(req.url ?? '') ? 'week' : 'day'
        void readStandup({
          span,
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
