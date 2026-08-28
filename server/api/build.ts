import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const __dirname = path.resolve(import.meta.dirname, '../..')

export function buildPlugin(): Plugin {
  return {
    name: 'reporto-reports-out-of-build',
    apply: 'build',
    closeBundle() {
      const dir = path.join(__dirname, 'dist/reports')
      if (!fs.existsSync(dir)) return
      fs.rmSync(dir, { recursive: true, force: true })
      this.info('removed dist/reports — report data never ships in a build')
    },
  }
}
