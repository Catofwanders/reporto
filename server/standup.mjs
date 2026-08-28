/**
 * What moved since the last working day — the half of a stand-up note that cannot be read
 * off the reports on disk.
 *
 * The reports are snapshots of *now*: they say where a ticket is today, not that it got
 * there yesterday, and they list open PRs, not the ones merged and gone. Both facts are
 * exactly what a stand-up needs, and both are one API query away.
 */
import { jiraSearchKeys, jiraStatusHistory } from './jira.mjs'
import { pullMergedSince } from './github.mjs'

/** Changelogs are one request each, so the window is capped rather than the whole board. */
const MAX_TICKETS = 25

/**
 * Monday looks back to Friday, every other day to yesterday. Weekend work still shows up:
 * the window is a start date, not a list of days.
 */
export function windowStart(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  // 1 is Monday. Three days back from Monday reaches Friday morning.
  start.setDate(start.getDate() - (start.getDay() === 1 ? 3 : 1))
  return start
}

/*
 * The local calendar date, not `toISOString().slice(0, 10)`.
 *
 * `windowStart` returns local midnight; at any positive UTC offset the ISO form of that instant
 * is the *previous* day, so the window opened a day early and Sunday work was reported as
 * "since yesterday". `en-CA` formats as YYYY-MM-DD, which is what JQL wants.
 */
const iso = (date) => date.toLocaleDateString('en-CA')

export async function readStandup({
  jiraSite,
  jiraEmail,
  jiraApiToken,
  jiraStatsJql = 'assignee = currentUser()',
  githubAuthor,
  githubOrg,
  githubAccount,
  now = new Date(),
}) {
  const start = windowStart(now)
  const since = iso(start)
  const jira = { site: jiraSite, email: jiraEmail, apiToken: jiraApiToken }
  const notes = []

  let moved = []
  try {
    // `changed AFTER "<date>"`, not `changed DURING (…, "now")`: Jira accepts the DURING
    // form and answers zero issues rather than an error, so the note came back empty.
    const keys = await jiraSearchKeys({
      ...jira,
      jql: `${jiraStatsJql} AND status changed AFTER "${since}"`,
    })
    for (const key of keys.slice(0, MAX_TICKETS)) {
      try {
        const history = await jiraStatusHistory({ ...jira, key })
        const inWindow = history.filter((change) => new Date(change.at) >= start)
        if (inWindow.length === 0) continue
        moved.push({
          key,
          from: inWindow[0].from,
          to: inWindow[inWindow.length - 1].to,
          steps: inWindow.length,
          at: inWindow[inWindow.length - 1].at,
        })
      } catch {
        // One unreadable changelog costs that ticket's line, not the note.
      }
    }
    if (keys.length > MAX_TICKETS) {
      notes.push(`${keys.length - MAX_TICKETS} more tickets moved than this note lists`)
    }
  } catch (err) {
    notes.push(`jira: ${err.message}`)
  }

  let merged = []
  try {
    merged = await pullMergedSince({
      author: githubAuthor,
      org: githubOrg,
      account: githubAccount,
      since,
    })
  } catch (err) {
    notes.push(`github: ${err.message}`)
  }

  moved = moved.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return { since, generatedAt: new Date().toISOString(), moved, merged, notes }
}
