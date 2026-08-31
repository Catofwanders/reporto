import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** The repo root, two levels up from `server/api`. */
const projectRoot = path.resolve(import.meta.dirname, '../..')

export function buildPlugin(): Plugin {
  return {
    name: 'reporto-reports-out-of-build',
    apply: 'build',
    closeBundle() {
      const dir = path.join(projectRoot, 'dist/reports')
      if (!fs.existsSync(dir)) return
      fs.rmSync(dir, { recursive: true, force: true })
      this.info('removed dist/reports — report data never ships in a build')
    },
  }
}
