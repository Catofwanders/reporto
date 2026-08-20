/**
 * Jira tickets straight from the REST API, no agent run involved. Auth is a personal API
 * token (Basic, email + token) rather than OAuth: this server is loopback-only and
 * single-user, so a token in the environment is the honest trade.
 *
 * Create one at https://id.atlassian.com/manage-profile/security/api-tokens and export
 * JIRA_EMAIL / JIRA_API_TOKEN (or put them in .env, which is gitignored).
 */

/** Status names whose category Jira reports as done, whatever the site calls them. */
const DONE_CATEGORY = 'Done'

const STATUS_CHIP = [
  [/^(blocked|on hold)$/i, 'bad'],
  [/^(code review|qc ready|in review)$/i, 'open'],
  [/^(in progress|in development)$/i, 'open'],
  [/^(next|backlog|to do|selected)$/i, 'na'],
]

/** Tone for a status chip; anything unrecognised stays neutral rather than guessing. */
function statusChip(status, category) {
  for (const [pattern, tone] of STATUS_CHIP) if (pattern.test(status)) return tone
  if (category === DONE_CATEGORY) return 'ok'
  return 'na'
}

function authHeader(email, apiToken) {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
}

/**
 * Confirm the credentials actually authenticate, because the search endpoint will not tell
 * us: POST /search/jql answers `200 {"issues":[],"isLast":true}` to an unauthorized caller
 * instead of 401, which reads as "you have no tickets" and is indistinguishable from a
 * correct empty result. /myself does return 401, so ask it first.
 */
async function whoAmI({ site, email, apiToken }) {
  const res = await fetch(`${site.replace(/\/$/, '')}/rest/api/3/myself`, {
    headers: { Authorization: authHeader(email, apiToken), Accept: 'application/json' },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Jira rejected the credentials (${res.status}) for ${email} at ${site}. Check that ` +
        'JIRA_EMAIL is the Atlassian account that owns the token, and that JIRA_API_TOKEN ' +
        'is a classic API token pasted whole.',
    )
  }
  if (!res.ok) {
    throw new Error(`Jira /myself failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * POST /rest/api/3/search/jql, paginated by nextPageToken. The older GET /search is
 * deprecated and returns fewer fields per call, so this endpoint is the one to use.
 */
async function searchIssues({ site, email, apiToken, jql }) {
  const issues = []
  let nextPageToken
  do {
    const res = await fetch(`${site.replace(/\/$/, '')}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(email, apiToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        jql,
        fields: ['summary', 'status'],
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Jira search failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
    }
    const page = await res.json()
    issues.push(...(page.issues ?? []))
    nextPageToken = page.nextPageToken
    // A page without a token is the last one; the flag is absent rather than false.
  } while (nextPageToken)
  return issues
}

/**
 * Group in the order the JQL returned, so the ORDER BY clause decides what a reader sees
 * first instead of a ranking baked in here.
 */
function groupByStatus(tickets) {
  const groups = new Map()
  for (const ticket of tickets) {
    const list = groups.get(ticket.status) ?? []
    list.push(ticket)
    groups.set(ticket.status, list)
  }
  return [...groups.entries()].map(([title, list]) => ({ title, tickets: list }))
}

export async function pullJira({ site, email, apiToken, jql, jiraBrowseUrl, resolvePrs }) {
  if (!site) throw new Error('no Jira site configured — set jiraSite in config/reporto.json')
  if (!email || !apiToken) {
    throw new Error(
      'no Jira credentials — export JIRA_EMAIL and JIRA_API_TOKEN (see server/jira.mjs)',
    )
  }

  const me = await whoAmI({ site, email, apiToken })
  const issues = await searchIssues({ site, email, apiToken, jql })
  const browse = (jiraBrowseUrl || `${site.replace(/\/$/, '')}/browse`).replace(/\/$/, '')

  // PRs are resolved after the search, so the resolver can spend its per-ticket fallback
  // budget on the statuses that matter instead of the whole backlog.
  const ticketPrs = resolvePrs
    ? await resolvePrs(
        issues.map((issue) => ({
          key: issue.key,
          status: issue.fields?.status?.name ?? 'Unknown',
        })),
      )
    : undefined

  const tickets = issues.map((issue) => {
    const status = issue.fields?.status?.name ?? 'Unknown'
    return {
      key: issue.key,
      url: `${browse}/${issue.key}`,
      status,
      chip: statusChip(status, issue.fields?.status?.statusCategory?.name),
      summary: issue.fields?.summary ?? '',
      prs: ticketPrs?.get(issue.key) ?? [],
      // An API pull has no opinion to add; notes are for a human or an agent to fill.
      notes: [],
    }
  })

  return {
    type: 'jira',
    date: new Date().toLocaleDateString('en-CA'),
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    groups: groupByStatus(tickets),
    footer:
      `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} for ` +
      `${me.displayName ?? email} from JQL, PRs matched by key in title.`,
  }
}
