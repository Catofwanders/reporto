import type { Plugin } from 'vite'
import { addSlackReaction, postSlackReply, resolveChannel } from '../slack.mjs'
import { loadConfig, readReport } from '../reports.mjs'
import { secretOf } from '../capabilities.mjs'
import { readBody, rejectCrossSite } from './guard.js'

export function slackPlugin(): Plugin {
  return {
    name: 'reporto-slack',
    configureServer(server) {
      server.middlewares.use('/api/slack', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const route = (req.url ?? '/').split('?')[0]

        // Where the stand-up would go, so the button can name it before anybody presses it.
        if (req.method === 'GET' && route === '/standup') {
          const channel = loadConfig().slackStandupChannel ?? null
          res.end(JSON.stringify({ channel }))
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
          res.end(JSON.stringify({ error: `slack write blocked: ${blocked}` }))
          return
        }
        if (route !== '/reply' && route !== '/react' && route !== '/standup') {
          res.statusCode = 404
          res.end('{"error":"no such slack action"}')
          return
        }

        readBody(req, (raw) => {
          let parsed: { id?: string; text?: string; name?: string }
          try {
            parsed = JSON.parse(raw || '{}') as typeof parsed
          } catch {
            res.statusCode = 400
            res.end('{"error":"body is not JSON"}')
            return
          }

          const token = secretOf('SLACK_USER_TOKEN')

          /*
           * The stand-up is the one message with no row behind it, so its destination comes
           * from config rather than from the request: the browser sends text and nothing
           * else, and `slackStandupChannel` decides where it lands.
           */
          if (route === '/standup') {
            const configured = loadConfig().slackStandupChannel
            if (!configured) {
              res.statusCode = 400
              res.end('{"error":"set slackStandupChannel in config/reporto.json"}')
              return
            }
            void resolveChannel(token, configured)
              .then((channel) =>
                postSlackReply({ token, channel, threadTs: null, text: parsed.text ?? '' }),
              )
              .then(
                (result) =>
                  // `configured` is the human's word for it ("#standup"); the API answers with
                  // an id, and the id is what a permalink needs.
                  res.end(JSON.stringify({ ok: true, ...result, named: configured })),
                (err: Error) => {
                  res.statusCode = 400
                  res.end(JSON.stringify({ ok: false, error: err.message }))
                },
              )
            return
          }

          // The row id is "channel:ts" and comes back to us rather than a channel of the
          // caller's choosing: whatever it names has to be a row already in the report.
          const report = readReport('slack') as { rows?: { id: string; channelId: string; threadTs: string | null }[] } | null
          const row = report?.rows?.find((entry) => entry.id === parsed.id)
          if (!row) {
            res.statusCode = 404
            res.end('{"error":"that message is not in the current Slack report"}')
            return
          }

          const ts = row.id.slice(row.id.indexOf(':') + 1)
          const action =
            route === '/reply'
              ? postSlackReply({
                  token,
                  channel: row.channelId,
                  // Answer inside the thread when the message is in one; otherwise in the
                  // channel, which is where a reply to a bare mention belongs.
                  threadTs: row.threadTs ? ts : null,
                  text: parsed.text ?? '',
                })
              : addSlackReaction({ token, channel: row.channelId, ts, name: parsed.name })

          void action.then(
            (result) => res.end(JSON.stringify({ ok: true, ...result })),
            (err: Error) => {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: err.message }))
            },
          )
        })
      })
    },
  }
}
