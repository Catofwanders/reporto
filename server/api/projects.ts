import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const __dirname = path.resolve(import.meta.dirname, '../..')

export function projectsPlugin(): Plugin {
  return {
    name: 'reporto-projects',
    configureServer(server) {
      server.middlewares.use('/api/projects', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('{"error":"use GET"}')
          return
        }
        for (const dir of ['config', 'config.template']) {
          const file = path.resolve(__dirname, dir, 'projects.json')
          if (!fs.existsSync(file)) continue
          try {
            res.end(fs.readFileSync(file, 'utf8'))
            return
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: `${dir}/projects.json: ${String(err)}` }))
            return
          }
        }
        res.statusCode = 404
        res.end(
          '{"error":"no projects.json — copy config.template/projects.json to config/ and describe your own work"}',
        )
      })
    },
  }
}

/**
 * What moved since the last working day, for the stand-up note. GET only, and read-only
 * against Jira and GitHub.
 */
