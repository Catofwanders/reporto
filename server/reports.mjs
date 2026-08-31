/**
 * Pulling a report and writing it down, in one place.
 *
 * The dev server does this in answer to a button, and `scripts/pull.mjs` does it from cron
 * before the working day starts. Both need the same config, the same pullers and the same
 * index bookkeeping, and a second copy of any of that is a second thing to keep in step.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pullOpenPrs, pullReviewQueue, pullTicketPrs } from './github.mjs'
import { pullJira } from './jira.mjs'
import { pullStats } from './stats.mjs'
import { pullGoogleCalendar } from './googleCalendar.mjs'
import { pullSlack } from './slack.mjs'
import { secretOf } from './capabilities.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const REPORTS = path.join(ROOT, 'public/reports')

/*
 * Where an unmatched ticket is worth a per-ticket PR search; backlog items are not. Universal
 * Jira vocabulary only — a workflow's later stages are named in `fallbackStatuses` in config,
 * because those names belong to whoever owns the board (rules/nda.md).
 */
const DEFAULT_FALLBACK_STATUSES = ['in progress', 'in development', 'code review', 'in review', 'blocked']

/** Everything not Done and not already released, freshest first. */
const DEFAULT_JQL =
  'assignee = currentUser() AND statusCategory != Done ORDER BY status ASC, updated DESC'

/**
 * Personal settings live in ./config (gitignored); the committed config.template is the
 * fallback, so a fresh checkout still boots.
 */
export function loadConfig() {
  for (const dir of ['config', 'config.template']) {
    const file = path.join(ROOT, dir, 'reporto.json')
    if (!fs.existsSync(file)) continue
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      console.warn(`[reporto] ignoring unreadable ${dir}/reporto.json: ${String(err)}`)
    }
  }
  return { commandGroups: [] }
}

/**
 * Lifts .env into the environment. Vite does this for the dev server; a plain `node` run
 * has to do it itself, and the pullers read their credentials from process.env.
 */
export function loadDotEnv() {
  const file = path.join(ROOT, '.env')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const at = line.indexOf('=')
    if (at === -1) continue
    const key = line.slice(0, at).trim()
    const value = line.slice(at + 1).trim()
    // An empty var is as good as unset: a blank placeholder must not win over a real value.
    if (key && value && !process.env[key]) process.env[key] = value
  }
}

/** The report currently on disk for a kind, or null when there is none to carry over. */
export function readReport(kind) {
  try {
    const indexFile = path.join(REPORTS, 'index.json')
    if (!fs.existsSync(indexFile)) return null
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
    const file = index.latest?.[kind]
    if (!file) return null
    const at = path.join(REPORTS, file)
    if (!fs.existsSync(at)) return null
    return JSON.parse(fs.readFileSync(at, 'utf8'))
  } catch {
    // A report we cannot read is one we cannot carry over; the pull still runs.
    return null
  }
}

/**
 * How many days of reports to keep on disk.
 *
 * Reports are the app's history — the stand-up reads yesterday, and a failed pull falls back
 * to the last good day — so they cannot be deleted on write. But nothing was ever removing
 * them either: the directory grows by six files a day forever, and `index.history` grows with
 * it, parsed in full on every boot. A month is longer than anything here looks back.
 */
const RETAIN_DAYS = 30

/**
 * What to keep, decided without touching the disk so it can be tested without one.
 *
 * `index.latest` is kept whatever its age: a kind that has not been pulled in six weeks —
 * statistics, usually — still has its newest report as the only thing the app can draw, and
 * deleting it because the date is old would blank that route.
 */
export function prunePlan(index, keepDays = RETAIN_DAYS, now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - keepDays)
  const oldest = cutoff.toLocaleDateString('en-CA')

  const history = (index.history ?? []).filter((entry) => String(entry.date ?? '') >= oldest)
  const keep = new Set(Object.values(index.latest ?? {}).filter(Boolean))
  for (const entry of history) {
    for (const [key, file] of Object.entries(entry)) {
      if (key !== 'date' && file) keep.add(file)
    }
  }
  return { history, keep }
}

/**
 * Drop reports older than the retention window, and the history entries naming them.
 *
 * Deliberately defensive about deleting: an index with nothing to keep means something is
 * wrong with the index, not that every report is garbage, so it removes nothing.
 */
function pruneReports(index) {
  const { history, keep } = prunePlan(index)
  if (keep.size === 0) return index
  let removed = 0
  for (const name of fs.readdirSync(REPORTS)) {
    if (name === 'index.json' || !name.endsWith('.json') || keep.has(name)) continue
    try {
      fs.unlinkSync(path.join(REPORTS, name))
      removed += 1
    } catch {
      // A file we cannot delete is not worth failing a pull over.
    }
  }
  if (removed) console.log(`[reporto] pruned ${removed} report${removed === 1 ? '' : 's'} over ${RETAIN_DAYS} days old`)
  return { ...index, history }
}

// A crash mid-write would leave a truncated report, so write beside it and rename.
function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

/**
 * `options` is how a caller asks for less work: the Jira puller takes `phase: 'fast'` to
 * answer with the board alone, leaving PRs and ticket ages for a second call.
 */
export const PULLERS = {
  // Settled months are read back from the last report instead of being recomputed: the
  // cycle-time medians cost one changelog request per ticket, and a month that has ended
  // cannot change.
  stats: (c) =>
    pullStats({
      jiraSite: c.jiraSite,
      jiraEmail: process.env.JIRA_EMAIL,
      jiraApiToken: process.env.JIRA_API_TOKEN,
      jiraStatsJql: c.jiraStatsJql,
      statsStatuses: c.statsStatuses,
      githubAuthor: c.githubAuthor ?? '',
      githubOrg: c.githubOrg ?? '',
      githubAccount: c.githubAccount,
      calendar: {
        serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        calendarIds: c.calendarIds ?? [],
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        include: c.calendars ?? [],
        exclude: c.calendarsExcluded ?? [],
      },
      months: c.statsMonths ?? 6,
      previous: readReport('stats'),
    }),

  slack: (c) =>
    pullSlack({
      token: secretOf('SLACK_USER_TOKEN'),
      days: c.slackDays ?? 14,
      excludeChannels: c.slackChannelsExcluded ?? [],
      ticketPattern: c.ticketPattern ?? '\\b[A-Z][A-Z0-9]+-\\d+\\b',
    }),

  reviews: (c) =>
    pullReviewQueue({
      author: c.githubAuthor ?? '',
      org: c.githubOrg ?? '',
      account: c.githubAccount,
      ticketPattern: c.ticketPattern ?? '\\b[A-Z][A-Z0-9]+-\\d+\\b',
    }),

  prs: (c) =>
    pullOpenPrs({
      author: c.githubAuthor ?? '',
      org: c.githubOrg ?? '',
      jiraBrowseUrl: c.jiraBrowseUrl ?? '',
      account: c.githubAccount,
      pinnedRepos: c.pinnedRepos ?? [],
      ticketPattern: c.ticketPattern ?? '\\b[A-Z][A-Z0-9]+-\\d+\\b',
    }),

  calendar: (c) =>
    pullGoogleCalendar({
      serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      calendarIds: c.calendarIds ?? [],
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      include: c.calendars ?? [],
      exclude: c.calendarsExcluded ?? [],
      upcomingDays: c.upcomingDays ?? 7,
    }),

  jira: (c, options = {}) => {
    const fallbackStatuses = (c.fallbackStatuses ?? DEFAULT_FALLBACK_STATUSES).map((s) =>
      s.toLowerCase(),
    )
    return pullJira({
      phase: options.phase ?? 'full',
      site: c.jiraSite,
      // Only the statuses a human is waiting on: aging a backlog item says nothing.
      agingStatuses: Object.keys(c.statusAging ?? {}).filter((key) => key !== 'default'),
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
      jql: c.jiraJql ?? DEFAULT_JQL,
      jiraBrowseUrl: c.jiraBrowseUrl,
      tones: c.statuses?.tones ?? {},
      // The board's own custom field names, and how far back the unread queue looks.
      activityFields: c.activityFields ?? [],
      ...(c.activityDays ? { activityDays: c.activityDays } : {}),
      resolvePrs: c.githubAuthor
        ? (tickets) =>
            pullTicketPrs({
              author: c.githubAuthor ?? '',
              org: c.githubOrg ?? '',
              ticketPattern: c.ticketPattern ?? '\\b[A-Z][A-Z0-9]+-\\d+\\b',
              account: c.githubAccount,
              fallbackKeys: tickets
                .filter((t) => fallbackStatuses.includes(t.status.toLowerCase()))
                .map((t) => t.key),
            })
        : undefined,
    })
  },
}

export const PULLABLE = Object.keys(PULLERS)

/**
 * Pulls one report and files it: `<kind>-<date>.json`, `index.latest` pointed at it, and
 * the day kept in `index.history` so a later failure can fall back to it.
 */
export async function pullReport(kind, config = loadConfig(), options = {}) {
  const puller = PULLERS[kind]
  if (!puller) throw new Error(`no API puller for "${kind}"`)
  if (!config.githubAuthor || !config.githubOrg) {
    throw new Error('set githubAuthor and githubOrg in config/reporto.json (see config.template)')
  }

  const started = Date.now()
  const report = await puller(config, options)
  const file = `${kind}-${report.date}.json`
  fs.mkdirSync(REPORTS, { recursive: true })
  writeJsonAtomic(path.join(REPORTS, file), report)

  const indexFile = path.join(REPORTS, 'index.json')
  const index = fs.existsSync(indexFile)
    ? JSON.parse(fs.readFileSync(indexFile, 'utf8'))
    : { latest: {}, history: [] }
  index.latest[kind] = file
  let day = index.history.find((entry) => entry.date === report.date)
  if (!day) {
    day = { date: report.date }
    index.history.unshift(day)
  }
  day[kind] = file
  writeJsonAtomic(indexFile, pruneReports(index))

  return { kind, file, date: report.date, durationMs: Date.now() - started }
}
