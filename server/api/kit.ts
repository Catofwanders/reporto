import path from 'node:path'
import type { Plugin } from 'vite'
import { readKit } from '../kit.mjs'

const projectRoot = path.resolve(import.meta.dirname, '../..')

export function kitPlugin(): Plugin {
  return {
    name: 'reporto-kit',
    configureServer(server) {
      server.middlewares.use('/api/kit', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('{"error":"use GET"}')
          return
        }
        try {
          res.end(JSON.stringify(readKit({ projectDir: projectRoot })))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
/**
 * Keeps the report files out of `dist/`.
 *
 * `public/` is Vite's publicDir, so a build copies every report into the bundle — 350KB of
 * ticket keys, meeting titles and Slack excerpts. The directory is gitignored, but the README
 * describes the static build as deployable, and a zipped `dist` would publish the lot. The app
 * fetches them at runtime from `public/reports/`, so nothing in a build should ever want them.
 */
