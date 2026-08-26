#!/usr/bin/env node
/**
 * Refuses to let employer-confidential words leave this machine.
 *
 * The remote is public and the work behind this dashboard is not: client names, repo names,
 * the Jira site, colleagues' logins, ticket keys. They belong in the gitignored `config/`
 * and nowhere else, and the way they escape is never a decision — it is a name that slipped
 * into a comment, a README example, or a commit message.
 *
 * The terms themselves are NOT in this file, and must never be: a committed list of the
 * words we are hiding would leak exactly what it protects. They are read from
 * `config/reporto.json` and `config/projects.json` (both gitignored, and already holding the
 * real names for the app's own sake), plus an optional free-form list at
 * `.claude/nda-terms.txt`.
 *
 * Usage:
 *   node scripts/nda-scan.mjs                 # what would be pushed: patch + messages
 *   node scripts/nda-scan.mjs --range A..B    # an explicit range
 *   node scripts/nda-scan.mjs --staged        # the staged patch, for a pre-commit check
 *   node scripts/nda-scan.mjs --tracked       # every tracked file, a full sweep
 *   node scripts/nda-scan.mjs --terms         # what it is looking for (count only)
 *
 * Exit codes: 0 clean, 1 findings, 2 cannot run (no term list — never treated as clean).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
  } catch {
    return null
  }
}

/**
 * A term is only worth matching if it is distinctive. Short strings and words this repo
 * uses about itself produce noise, and a scanner that cries wolf gets bypassed — which is
 * the one failure mode that matters here.
 */
const GENERIC = new Set([
  'client',
  'server',
  'admin',
  'portal',
  'backend',
  'frontend',
  'dashboard',
  'reports',
  'report',
  'reporto',
  'calendar',
  'project',
  'projects',
  'github',
  'google',
  'atlassian',
  'jira',
  'main',
  'master',
  'core',
  'api',
  'web',
  'app',
  'test',
  'tests',
  'graphql',
  'strapi',
  'gateway',
  'browse',
  // Common nouns that happen to be project slugs. The identifying string is the full repo
  // name, which stays a term; the bare noun matches ordinary prose and the invented fixtures.
  'marketplace',
  'storefront',
])

/** Hosts everyone uses. Their names identify nobody; their subdomains sometimes do. */
const PUBLIC_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org'])

/** Lock files and vendored data are pages of URLs and names, and never where a leak hides. */
const SKIP_FILES = /^(package-lock\.json|.*\.lock|.*\.min\.(js|css)|docs\/.*\.(png|jpe?g|gif|webp))$/

/**
 * Auto-derived terms need length to be trustworthy. Ones written down by hand — a ticket
 * prefix, a colleague's login — are deliberate, so they only have to clear a floor of 3.
 */
const usable = (term, floor) => {
  const value = String(term ?? '').trim()
  if (value.length < floor) return null
  if (GENERIC.has(value.toLowerCase())) return null
  return value
}

/**
 * What in a URL identifies the employer: the subdomain of a tenant host (the
 * "<company>" of "<company>.atlassian.net") and the repository name. Not the host itself,
 * and not every path segment — adding "github.com" and "browse" as secrets made the scan
 * mostly noise, and a noisy gate is one that gets bypassed.
 */
function fromUrl(url, out) {
  try {
    const parsed = new URL(url)
    if (!PUBLIC_HOSTS.has(parsed.hostname)) {
      out.add(parsed.hostname)
      out.add(parsed.hostname.split('.')[0])
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    // github.com/<org>/<repo> — both matter; a deeper path is a page, not a name.
    if (PUBLIC_HOSTS.has(parsed.hostname)) for (const part of parts.slice(0, 2)) out.add(part)
  } catch {
    /* not a URL; the caller already added the raw value */
  }
}

function collectTerms() {
  const out = new Set()
  // Written down on purpose, so allowed to be short.
  const forced = new Set()
  const config = readJson('config/reporto.json') ?? {}

  for (const key of ['githubOrg', 'githubAuthor', 'githubAccount']) {
    if (config[key]) out.add(config[key])
  }
  for (const key of ['jiraSite', 'jiraBrowseUrl']) {
    if (config[key]) fromUrl(config[key], out)
  }
  for (const repo of config.pinnedRepos ?? []) out.add(repo)
  for (const id of config.calendarIds ?? []) {
    out.add(id)
    const [local, domain] = String(id).split('@')
    out.add(local)
    if (domain) {
      out.add(domain)
      out.add(domain.split('.')[0])
    }
  }
  // A ticket pattern like "\b<KEY>-\d+\b" yields its project key, so every ticket
  // reference is caught rather than only the ones somebody remembered to list.
  const prefix = /([A-Z][A-Z0-9]{1,9})-\\d/.exec(config.ticketPattern ?? '')
  if (prefix) forced.add(prefix[1])

  const projects = readJson('config/projects.json') ?? {}
  for (const project of projects.projects ?? []) {
    out.add(project.name)
    out.add(project.id)
    if (project.url) fromUrl(project.url, out)
  }

  // The escape hatch: colleagues' logins, a client's name, anything the config never holds.
  const extra = path.join(ROOT, '.claude/nda-terms.txt')
  if (fs.existsSync(extra)) {
    for (const line of fs.readFileSync(extra, 'utf8').split('\n')) {
      const value = line.trim()
      if (value && !value.startsWith('#')) forced.add(value)
    }
  }

  const kept = new Set()
  for (const term of out) {
    const value = usable(term, 5)
    if (value) kept.add(value)
  }
  for (const term of forced) {
    const value = usable(term, 3)
    if (value) kept.add(value)
  }
  return [...kept].sort()
}

/** Case-insensitive, and only on a word boundary: "core" must not fire inside "scoreboard". */
const patternFor = (term) => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const edge = (side) => (/[A-Za-z0-9]/.test(side) ? '\\b' : '')
  return new RegExp(`${edge(term[0])}${escaped}${edge(term.at(-1))}`, 'i')
}

function scan(label, text, terms, findings) {
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const { term, pattern } of terms) {
      if (pattern.test(line)) findings.push({ label, line: i + 1, term, text: line.trim() })
    }
  })
}

/** Only added lines matter: a diff that *removes* a leaked name is the fix, not the problem. */
const addedLines = (patch) =>
  patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .join('\n')

function defaultRange() {
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim()
    return `${upstream}..HEAD`
  } catch {
    return 'origin/main..HEAD'
  }
}

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const valueOf = (flag) => {
  const at = args.indexOf(flag)
  return at === -1 ? null : args[at + 1]
}

const terms = collectTerms().map((term) => ({ term, pattern: patternFor(term) }))

if (has('--terms')) {
  console.log(`${terms.length} terms from config/ and .claude/nda-terms.txt`)
  process.exit(terms.length ? 0 : 2)
}

if (terms.length === 0) {
  console.error(
    'nda-scan: no terms found. Expected config/reporto.json (and optionally\n' +
      'config/projects.json or .claude/nda-terms.txt). Refusing to report "clean" —\n' +
      'a scanner with nothing to look for is not a check.',
  )
  process.exit(2)
}

const findings = []

if (has('--tracked')) {
  for (const file of git(['ls-files']).split('\n').filter(Boolean)) {
    if (SKIP_FILES.test(file)) continue
    // Only text: a binary match is a false positive, and images are not where names hide.
    try {
      scan(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), terms, findings)
    } catch {
      /* unreadable or binary */
    }
  }
} else if (has('--staged')) {
  scan('staged patch', addedLines(git(['diff', '--cached', '--unified=0'])), terms, findings)
} else {
  const range = valueOf('--range') ?? defaultRange()
  let patch = ''
  let messages = ''
  try {
    patch = git(['diff', '--unified=0', range])
    messages = git(['log', '--format=%B', range])
  } catch {
    console.error(`nda-scan: cannot read ${range} — is the remote fetched?`)
    process.exit(2)
  }
  scan(`patch ${range}`, addedLines(patch), terms, findings)
  // Messages travel with the push and are the half that gets forgotten.
  scan(`commit messages ${range}`, messages, terms, findings)
}

if (findings.length === 0) {
  process.exit(0)
}

console.error(`\nnda-scan: ${findings.length} confidential term${findings.length === 1 ? '' : 's'} found\n`)
for (const finding of findings.slice(0, 40)) {
  const snippet = finding.text.length > 120 ? `${finding.text.slice(0, 117)}…` : finding.text
  console.error(`  ${finding.label}:${finding.line}  [${finding.term}]  ${snippet}`)
}
if (findings.length > 40) console.error(`  … and ${findings.length - 40} more`)
console.error(
  '\nFix the file, or reword the commit message, before pushing. If a term is genuinely\n' +
    'public, drop it from .claude/nda-terms.txt — never pass --no-verify.\n',
)
process.exit(1)
