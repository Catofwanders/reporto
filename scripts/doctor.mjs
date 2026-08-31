#!/usr/bin/env node
/**
 * Why the dashboard is not showing what you expect, answered from the terminal:
 *
 *   npm run doctor
 *
 * The Settings page already reports which modules are configured — but exactly when that
 * matters most, the app will not boot: no config file, the wrong Node, a `gh` that lost its
 * auth. This is the same information from outside the app, plus the checks a browser cannot
 * make.
 *
 * Nothing here writes anything, and no credential value is ever printed — only whether one is
 * present. Exit code 1 means something is broken rather than merely unconfigured, which is
 * what a cron wrapper wants to know.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { loadDotEnv } from '../server/reports.mjs'
import { capabilities } from '../server/capabilities.mjs'

const run = promisify(execFile)
const ROOT = path.resolve(import.meta.dirname, '..')

const OK = '✓'
const WARN = '!'
const BAD = '✗'

let broken = 0
let warned = 0

const line = (mark, what, detail = '') => {
  if (mark === BAD) broken += 1
  if (mark === WARN) warned += 1
  console.log(`${mark} ${what.padEnd(28)} ${detail}`)
}

const heading = (title) => console.log(`\n${title}`)

/* ---------------------------------------------------------------- the machine */

heading('Environment')

const wanted = fs.existsSync(path.join(ROOT, '.nvmrc'))
  ? fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim()
  : null
const [major, minor] = process.versions.node.split('.').map(Number)
// Vite 8 needs 20.19+; an older Node fails in ways that do not name the version.
const nodeOk = major > 20 || (major === 20 && minor >= 19)
line(
  nodeOk ? OK : BAD,
  'node',
  `${process.version}${wanted ? ` (.nvmrc pins ${wanted})` : ''}${nodeOk ? '' : ' — needs 20.19+, run: nvm use'}`,
)

const hasConfig = fs.existsSync(path.join(ROOT, 'config/reporto.json'))
line(
  hasConfig ? OK : BAD,
  'config/reporto.json',
  hasConfig
    ? ''
    : // `loadConfig` falls back to config.template so a fresh clone still boots, which is why
      // a module below can look configured while pointing at "your-github-org".
      'missing — cp -r config.template config. Until then the template placeholders are in force',
)
const hasEnv = fs.existsSync(path.join(ROOT, '.env'))
line(hasEnv ? OK : BAD, '.env', hasEnv ? '' : 'missing — cp .env.example .env')

let ghAuthed = false
try {
  await run('gh', ['auth', 'token'], { timeout: 15_000 })
  ghAuthed = true
  line(OK, 'gh auth', 'a token is available')
} catch {
  line(WARN, 'gh auth', 'no token — PRs and reviews will fail. Run: gh auth login')
}

/* ------------------------------------------------------------------- modules */

heading('Modules')

// `capabilities()` reads config itself; this only lifts .env, which a plain node run needs.
loadDotEnv()

for (const cap of capabilities()) {
  const missing = [...cap.missingEnv, ...cap.missingConfig]
  if (!cap.enabled) {
    line(WARN, cap.label, 'switched off in Settings')
    continue
  }
  if (cap.missingGh && !ghAuthed) {
    line(BAD, cap.label, 'needs a gh token')
    continue
  }
  if (missing.length) {
    line(BAD, cap.label, `missing ${missing.join(', ')} — see docs/setup.md`)
    continue
  }
  line(OK, cap.label, 'configured')
}

/* ------------------------------------------------------------------- reports */

heading('Reports')

const reports = path.join(ROOT, 'public/reports')
const index = path.join(reports, 'index.json')
if (!fs.existsSync(index)) {
  line(WARN, 'index.json', 'no reports yet — press update in the app, or run: npm run pull')
} else {
  const { latest = {}, history = [] } = JSON.parse(fs.readFileSync(index, 'utf8'))
  const days = (file) => {
    const at = path.join(reports, file)
    if (!fs.existsSync(at)) return null
    return Math.floor((Date.now() - fs.statSync(at).mtimeMs) / 86_400_000)
  }
  for (const [kind, file] of Object.entries(latest)) {
    const age = days(file)
    if (age === null) {
      // The index pointing at a file that is gone is why the loader walks history.
      line(WARN, kind, `${file} is named by the index but not on disk`)
    } else {
      line(age > 7 ? WARN : OK, kind, `${file}, ${age === 0 ? 'today' : `${age}d old`}`)
    }
  }
  line(OK, 'history', `${history.length} day${history.length === 1 ? '' : 's'} kept`)
}

/* ------------------------------------------------------------------- the gate */

heading('Confidential-material gate')

try {
  const { stdout } = await run('git', ['config', 'core.hooksPath'], { cwd: ROOT, timeout: 5_000 })
  const wired = stdout.trim() === '.githooks'
  line(
    wired ? OK : BAD,
    'pre-push hook',
    wired ? 'core.hooksPath is .githooks' : `core.hooksPath is "${stdout.trim() || 'unset'}" — run: git config core.hooksPath .githooks`,
  )
} catch {
  line(BAD, 'pre-push hook', 'core.hooksPath is unset — run: git config core.hooksPath .githooks')
}

try {
  // --terms prints how many terms it has and never the terms themselves.
  const { stdout } = await run('node', [path.join(ROOT, 'scripts/nda-scan.mjs'), '--terms'], {
    cwd: ROOT,
    timeout: 15_000,
  })
  line(OK, 'scanner terms', stdout.trim())
} catch (err) {
  /*
   * Exit 2 is the scanner refusing to report clean with nothing to look for. On a fresh clone
   * that is correct and expected — the term lists are gitignored — so it is named as the thing
   * to do rather than as a malfunction.
   */
  const noTerms = err?.code === 2
  line(
    BAD,
    'scanner terms',
    noTerms
      ? 'no terms available — the lists live in config/ and .claude/nda-terms.txt, both gitignored'
      : `nda-scan could not report: ${String(err?.stderr || err?.message || err).split('\n')[0]}`,
  )
}

/* ---------------------------------------------------------------------- verdict */

console.log()
if (broken) {
  console.log(`${BAD} ${broken} problem${broken === 1 ? '' : 's'} to fix${warned ? `, ${warned} warning${warned === 1 ? '' : 's'}` : ''}.`)
  process.exit(1)
}
console.log(
  warned
    ? `${WARN} nothing broken, ${warned} warning${warned === 1 ? '' : 's'}.`
    : `${OK} everything is configured.`,
)
