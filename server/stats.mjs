/**
 * Monthly work statistics, pulled straight from the APIs rather than derived from the
 * daily report files. The reports on disk are day snapshots with gaps — weekends, days
 * off, and any day the puller did not run — so diffing them would invent transitions that
 * never happened and miss ones that happened twice between two snapshots. Jira and GitHub
 * both answer date-range questions directly, so ask them.
 *
 * Months other than the current one never change, so they are carried over from the
 * previous report: only the current month costs the per-issue changelog reads.
 */
import { jiraSearchKeys, jiraStatusHistory } from './jira.mjs'
import { pullPrStats } from './github.mjs'
import { pullMeetingLoad } from './googleCalendar.mjs'

/** Status names this workflow uses. Overridable per site from config/reporto.json. */
const DEFAULT_STATS_STATUSES = {
  releaseReady: 'RELEASE READY',
  deployed: 'Released to Production',
  qcReady: 'QC READY',
  qcFailed: 'QC Failed',
  inProgress: 'In Progress',
}

/** Issues sampled per month for cycle time — one changelog read each, so it is capped. */
const CYCLE_SAMPLE = 40

const pad = (n) => String(n).padStart(2, '0')

/** `2026-08` → the month's inclusive date bounds, plus the exclusive end JQL wants. */
function monthBounds(month) {
  const [year, mon] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, mon - 1, 1))
  const nextStart = new Date(Date.UTC(year, mon, 1))
  const last = new Date(nextStart.getTime() - 86_400_000)
  return {
    from: `${year}-${pad(mon)}-01`,
    to: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`,
    jqlFrom: `${year}-${pad(mon)}-01`,
    jqlTo: `${nextStart.getUTCFullYear()}-${pad(nextStart.getUTCMonth() + 1)}-01`,
    start,
  }
}

/** Newest first: this month, then the previous `count - 1`. */
function recentMonths(count, today = new Date()) {
  const out = []
  for (let back = 0; back < count; back += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1))
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`)
  }
  return out
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(value * 10) / 10
}

/**
 * Days from the last "In Progress" before a status was reached to the first time it was
 * reached. Counting from the *last* start rather than the first is deliberate: a ticket
 * bounced back from QC and picked up again should report the work, not the calendar time
 * it sat in someone else's queue.
 */
function daysToStatus(history, { inProgress, target }) {
  const arrival = history.find((change) => change.to === target)
  if (!arrival) return null
  const started = [...history]
    .filter((change) => change.to === inProgress && new Date(change.at) < new Date(arrival.at))
    .pop()
  if (!started) return null
  return (new Date(arrival.at).getTime() - new Date(started.at).getTime()) / 86_400_000
}

async function jiraMonth({ jira, statuses, month, jql }) {
  const { jqlFrom, jqlTo } = monthBounds(month)
  const during = (status) =>
    `${jql} AND status changed to "${status}" DURING ("${jqlFrom}","${jqlTo}")`

  const [releaseReady, deployed, qcReady, qcFailed, created] = await Promise.all([
    jiraSearchKeys({ ...jira, jql: during(statuses.releaseReady) }),
    jiraSearchKeys({ ...jira, jql: during(statuses.deployed) }),
    jiraSearchKeys({ ...jira, jql: during(statuses.qcReady) }),
    jiraSearchKeys({ ...jira, jql: during(statuses.qcFailed) }),
    jiraSearchKeys({
      ...jira,
      jql: `${jql} AND created >= "${jqlFrom}" AND created < "${jqlTo}"`,
    }),
  ])

  // Cycle time comes from the changelogs of the tickets that landed this month, which is
  // one request per ticket — hence the cap, and hence months being cached once computed.
  const sample = releaseReady.slice(0, CYCLE_SAMPLE)
  const durations = []
  for (const key of sample) {
    try {
      const history = await jiraStatusHistory({ ...jira, key })
      const days = daysToStatus(history, {
        inProgress: statuses.inProgress,
        target: statuses.releaseReady,
      })
      if (days !== null) durations.push(days)
    } catch {
      // One unreadable changelog costs that ticket's contribution, not the month.
    }
  }

  return {
    jira: {
      releaseReady: releaseReady.length,
      deployed: deployed.length,
      qcReady: qcReady.length,
      qcFailed: qcFailed.length,
      created: created.length,
    },
    cycle: { releaseReadyDays: median(durations), sampled: durations.length },
  }
}

/**
 * One month of everything, with each source allowed to fail on its own: a Jira token that
 * expired must not blank the PR numbers, and no Google credentials must not blank the rest.
 * Whatever failed is named in `missing` so the page can say so instead of showing a zero.
 */
async function statsMonth({ month, jira, statuses, jql, github, meetings }) {
  const missing = []
  let jiraPart = null
  let prs = null

  try {
    jiraPart = await jiraMonth({ jira, statuses, month, jql })
  } catch (err) {
    missing.push(`jira: ${err.message}`)
  }

  try {
    const { from, to } = monthBounds(month)
    const raw = await pullPrStats({ ...github, from, to })
    prs = {
      merged: raw.merged,
      opened: raw.opened,
      abandoned: raw.abandoned,
      reviewsGiven: raw.reviewsGiven,
      byRepo: raw.byRepo,
      medianHoursToFirstReview: median(raw.hoursToFirstReview),
      medianHoursToMerge: median(raw.hoursToMerge),
    }
  } catch (err) {
    missing.push(`github: ${err.message}`)
  }

  const meeting = meetings.get(month) ?? null

  return {
    month,
    jira: jiraPart?.jira ?? null,
    cycle: jiraPart?.cycle ?? null,
    prs,
    meetings: meeting,
    missing,
  }
}

export async function pullStats({
  jiraSite,
  jiraEmail,
  jiraApiToken,
  jiraStatsJql = 'assignee = currentUser()',
  statsStatuses = {},
  githubAuthor,
  githubOrg,
  githubAccount,
  calendar = {},
  months = 6,
  previous = null,
}) {
  const statuses = { ...DEFAULT_STATS_STATUSES, ...statsStatuses }
  const jira = { site: jiraSite, email: jiraEmail, apiToken: jiraApiToken }
  const github = { author: githubAuthor, org: githubOrg, account: githubAccount }
  const wanted = recentMonths(months)
  const current = wanted[0]

  // Past months are settled history: keep whatever the last run computed, and only when it
  // actually holds numbers — a cached month whose sources all failed is worth retrying.
  const cached = new Map(
    (previous?.months ?? [])
      .filter((m) => m.month !== current && (m.jira || m.prs))
      .map((m) => [m.month, m]),
  )
  const toFetch = wanted.filter((month) => !cached.has(month))

  const meetings = new Map()
  const notes = []
  if (toFetch.length) {
    try {
      const ranges = toFetch.map((month) => {
        const { from, to } = monthBounds(month)
        return { month, from, to }
      })
      for (const entry of await pullMeetingLoad({ ...calendar, ranges })) {
        meetings.set(entry.month, { hours: entry.hours, count: entry.count })
      }
    } catch (err) {
      notes.push(`meeting hours unavailable: ${err.message}`)
    }
  }

  const fetched = []
  for (const month of toFetch) {
    fetched.push(
      await statsMonth({ month, jira, statuses, jql: jiraStatsJql, github, meetings }),
    )
  }

  const byMonth = new Map([...cached, ...fetched.map((m) => [m.month, m])])
  const monthsOut = wanted.map((month) => byMonth.get(month)).filter(Boolean)

  return {
    type: 'stats',
    date: new Date().toLocaleDateString('en-CA'),
    generatedAt: new Date().toISOString(),
    months: monthsOut,
    statuses,
    notes: [...notes, ...monthsOut.flatMap((m) => m.missing.map((x) => `${m.month} — ${x}`))],
  }
}
