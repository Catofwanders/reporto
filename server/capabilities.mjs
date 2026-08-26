/**
 * What this machine can actually do, and what it is missing.
 *
 * A card for a report the server cannot fetch is worse than no card: the button fails, the
 * page says "no report yet", and neither says why. So every report kind declares what it
 * needs — environment variables and config keys — and the app hides what is unusable rather
 * than offering it.
 *
 * Values never leave the server. A variable is reported as set or unset and nothing else:
 * the browser has no reason to hold a token it cannot use.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from './reports.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const ENV_FILE = path.join(ROOT, '.env')

/**
 * `requires` is a list of alternatives, each an AND-set of variables: Google Calendar takes
 * either a service-account key or the three installed-app OAuth values, and having one of
 * those routes is enough.
 *
 * `config` names keys that must be present in config/reporto.json — a GitHub org is not a
 * secret, but a pull without it is a pull of nothing.
 */
export const CAPABILITIES = {
  jira: {
    label: 'Jira',
    requires: [['JIRA_EMAIL', 'JIRA_API_TOKEN']],
    config: ['jiraSite'],
    note: 'A personal Atlassian API token, plus the account e-mail it belongs to.',
  },
  prs: {
    label: 'Pull requests',
    requires: [],
    config: ['githubOrg', 'githubAuthor'],
    gh: true,
    note: 'Uses the gh CLI keyring rather than a token in .env — run `gh auth login`.',
  },
  reviews: {
    label: 'Reviews',
    requires: [],
    config: ['githubOrg', 'githubAuthor'],
    gh: true,
    note: 'Same GitHub auth as the PR report.',
  },
  calendar: {
    label: 'Calendar',
    requires: [
      ['GOOGLE_SERVICE_ACCOUNT_KEY'],
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    ],
    config: [],
    note: 'A service-account key, or the installed-app OAuth trio from `npm run google-auth`.',
  },
  stats: {
    label: 'Statistics',
    requires: [['JIRA_EMAIL', 'JIRA_API_TOKEN']],
    config: ['githubOrg', 'githubAuthor'],
    gh: true,
    note: 'Reads Jira, GitHub and the calendar for six months, so it needs all three.',
  },
}

/** Every variable this app will accept a value for. Anything else is not writable. */
export const WRITABLE = [
  ...new Set(Object.values(CAPABILITIES).flatMap((cap) => cap.requires.flat())),
]

/**
 * The shape a value must have, so a mistyped paste fails here rather than as a 401 an hour
 * later. Deliberately loose: a prefix and a length, never a full-format claim.
 */
const SHAPE = {
  JIRA_EMAIL: { test: (v) => v.includes('@'), hint: 'an e-mail address' },
  JIRA_API_TOKEN: { test: (v) => v.length >= 20, hint: 'an Atlassian API token' },
  GOOGLE_SERVICE_ACCOUNT_KEY: {
    test: (v) => v.startsWith('/') || v.startsWith('~'),
    hint: 'an absolute path to the downloaded JSON key',
  },
  GOOGLE_CLIENT_ID: {
    test: (v) => v.endsWith('.apps.googleusercontent.com'),
    hint: 'a Google client id',
  },
  GOOGLE_CLIENT_SECRET: { test: (v) => v.length >= 10, hint: 'a Google client secret' },
  GOOGLE_REFRESH_TOKEN: { test: (v) => v.startsWith('1//'), hint: 'a Google refresh token' },
}

/** Lines of .env as [key, hasValue] — the value itself is read but never returned. */
function envEntries() {
  const entries = new Map()
  if (!fs.existsSync(ENV_FILE)) return entries
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at === -1) continue
    entries.set(trimmed.slice(0, at).trim(), trimmed.slice(at + 1).trim())
  }
  return entries
}

const isSet = (name, env) => Boolean(env.get(name) || process.env[name])

// The gh CLI keeps its auth in its own config, not in this repo. Checking the file rather
// than shelling out to `gh auth status` keeps this synchronous and cheap.
function ghAuthed() {
  for (const file of ['hosts.yml', 'hosts.yaml']) {
    if (fs.existsSync(path.join(process.env.HOME ?? '', '.config/gh', file))) return true
  }
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
}

/**
 * One report kind's standing: configured or not, what is missing, and whether the user has
 * switched it off by hand. A kind that is configured but disabled stays hidden — that is the
 * point of the switch.
 */
export function capabilityOf(kind, config = loadConfig(), env = envEntries()) {
  const cap = CAPABILITIES[kind]
  if (!cap) return null

  const routes = cap.requires.length ? cap.requires : [[]]
  const satisfied = routes.map((route) => route.filter((name) => !isSet(name, env)))
  // The route closest to done is the one worth reporting: telling somebody with a
  // service-account key that they are missing three OAuth values is noise.
  const missingEnv = satisfied.sort((a, b) => a.length - b.length)[0]
  const missingConfig = (cap.config ?? []).filter((key) => !config[key])
  const missingGh = cap.gh && !ghAuthed()

  const disabled = new Set(config.disabledModules ?? [])
  return {
    kind,
    label: cap.label,
    note: cap.note,
    // Which variables this kind would accept, so Settings can offer exactly those fields.
    vars: [...new Set(cap.requires.flat())],
    missingEnv,
    missingConfig,
    missingGh: Boolean(missingGh),
    configured: missingEnv.length === 0 && missingConfig.length === 0 && !missingGh,
    enabled: !disabled.has(kind),
  }
}

export function capabilities() {
  const config = loadConfig()
  const env = envEntries()
  return Object.keys(CAPABILITIES).map((kind) => capabilityOf(kind, config, env))
}

/**
 * Writes one variable into .env, preserving every other line and comment.
 *
 * Rejects anything not on the writable list, and anything whose shape is obviously wrong —
 * a token pasted into the e-mail field fails here rather than as a 401 an hour later. The
 * file is written 0600 and by rename, so a crash cannot leave it half-written.
 */
export function setSecret(name, value) {
  if (!WRITABLE.includes(name)) throw new Error(`${name} is not a settable variable`)
  const trimmed = String(value ?? '').trim()
  if (!trimmed) throw new Error('empty value')
  if (/[\n\r]/.test(trimmed)) throw new Error('value contains a line break')
  if (trimmed.length > 4096) throw new Error('value is implausibly long')
  const shape = SHAPE[name]
  if (shape && !shape.test(trimmed)) throw new Error(`that does not look like ${shape.hint}`)

  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split('\n') : []
  let replaced = false
  const next = lines.map((line) => {
    if (!line.startsWith(`${name}=`)) return line
    replaced = true
    return `${name}=${trimmed}`
  })
  if (!replaced) {
    if (next.length && next[next.length - 1] !== '') next.push('')
    next.push(`${name}=${trimmed}`, '')
  }

  const tmp = `${ENV_FILE}.tmp`
  fs.writeFileSync(tmp, next.join('\n'), { mode: 0o600 })
  fs.renameSync(tmp, ENV_FILE)
  // The running process reads credentials from process.env, so a value written now has to
  // land there too or the next pull would still fail.
  process.env[name] = trimmed
  return { name, configured: true, replaced }
}

/** Turning a module off is a config write, not a browser preference: `npm run pull` reads it too. */
export function setEnabled(kind, enabled) {
  if (!CAPABILITIES[kind]) throw new Error(`unknown module "${kind}"`)
  const file = path.join(ROOT, 'config/reporto.json')
  if (!fs.existsSync(file)) throw new Error('config/reporto.json does not exist yet')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  const disabled = new Set(config.disabledModules ?? [])
  if (enabled) disabled.delete(kind)
  else disabled.add(kind)
  config.disabledModules = [...disabled].sort()

  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`)
  fs.renameSync(tmp, file)
  return { kind, enabled }
}
