/**
 * Jira tickets straight from the REST API, no agent run involved. Auth is a personal API
 * token (Basic, email + token) rather than OAuth: this server is loopback-only and
 * single-user, so a token in the environment is the honest trade.
 *
 * Create one at https://id.atlassian.com/manage-profile/security/api-tokens and export
 * JIRA_EMAIL / JIRA_API_TOKEN (or put them in .env, which is gitignored).
 */

import { pooled } from './pool.mjs'

/** Status names whose category Jira reports as done, whatever the site calls them. */
const DONE_CATEGORY = 'Done'

/*
 * Fallback tone per status, in universal Jira vocabulary only. Anything past "in review" is
 * somebody's own pipeline, so its tone comes from `statuses.tones` in config — see
 * rules/nda.md, and `src/statusVocab.ts` for the client half, which takes precedence over the
 * chip written here.
 */
const STATUS_CHIP = [
  [/^(blocked)$/i, 'bad'],
  [/^on hold$/i, 'qcout'],
  [/^(code review|in review|review)$/i, 'open'],
  [/^(in progress|in development|doing)$/i, 'open'],
  [/^(next|backlog|to do|selected|new)$/i, 'na'],
]

/** Tone for a status chip; anything unrecognised stays neutral rather than guessing. */
function statusChip(status, category, tones = {}) {
  const wanted = status.trim().toLowerCase()
  for (const [tone, names] of Object.entries(tones)) {
    if ((names ?? []).some((name) => String(name).trim().toLowerCase() === wanted)) return tone
  }
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
        fields: ['summary', 'status', 'created'],
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

/** Jira credentials, resolved once per call site. */
function requireAuth({ site, email, apiToken }) {
  if (!site) throw new Error('no Jira site configured — set jiraSite in config/reporto.json')
  if (!email || !apiToken) {
    throw new Error('no Jira credentials — set JIRA_EMAIL and JIRA_API_TOKEN')
  }
  return { base: site.replace(/\/$/, ''), auth: authHeader(email, apiToken) }
}

/**
 * The transitions Jira will accept for this issue right now. Workflows differ per project
 * and per current status, so the list has to come from Jira rather than a table here — and
 * it is fetched lazily, per ticket, because asking for 30 tickets up front would cost 30
 * round trips for a menu nobody may open.
 */
export async function jiraTransitions({ site, email, apiToken, key, allow = [] }) {
  const { base, auth } = requireAuth({ site, email, apiToken })
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Jira transitions for ${key} failed: ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  // Jira offers the whole workflow — twenty-odd statuses including several nobody moves a
  // ticket to by hand. Filter to the ones actually used, by target status rather than by
  // transition name, since Jira names those inconsistently.
  const wanted = allow.map((status) => status.toLowerCase())
  return (body.transitions ?? [])
    .map((t) => ({ id: t.id, name: t.name, to: t.to?.name ?? t.name }))
    .filter((t) => (wanted.length ? wanted.includes(t.to.toLowerCase()) : true))
}

/**
 * Apply one transition. Jira answers 204 with no body on success, and 400 when the
 * transition is not valid from the current status — which happens when the board moved
 * under us, so the message says to reload rather than blaming the click.
 */
export async function jiraTransition({ site, email, apiToken, key, transitionId, allow = [] }) {
  const { base, auth } = requireAuth({ site, email, apiToken })
  // Check the id against the same filtered list the menu was built from, so a stale page
  // or a hand-made request cannot reach a status the config excludes.
  if (allow.length) {
    const offered = await jiraTransitions({ site, email, apiToken, key, allow })
    if (!offered.some((t) => t.id === String(transitionId))) {
      throw new Error(
        `transition ${transitionId} is not one of the statuses reporto offers for ${key} (${allow.join(', ')})`,
      )
    }
  }
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ transition: { id: String(transitionId) } }),
  })
  if (res.status === 204 || res.ok) return { key, transitionId }
  const text = await res.text()
  if (res.status === 400) {
    throw new Error(
      `Jira refused that transition for ${key} — the status may have changed since this was loaded. Refresh and try again. (${text.slice(0, 160)})`,
    )
  }
  throw new Error(`Jira transition for ${key} failed: ${res.status} ${text.slice(0, 200)}`)
}

/** At most this many changelogs per pull: one request each, and a board is not a quarter. */
const AGING_LOOKUPS = 40

/** In flight at once. Jira's limits are per-token and generous; four is nowhere near them. */
const AGING_CONCURRENCY = 4

/**
 * When the ticket entered the status it is in now.
 *
 * The board looks identical on day one and day seven of a review column, which is the whole
 * problem: a ticket can sit in review for a week and nothing on screen says so. The changelog
 * is the only place that knows, at one request per ticket — so only tickets whose status is
 * worth aging get one, and a ticket that never transitioned falls back to when it was created.
 */
async function statusSinceFor({ site, email, apiToken, key, status, created }) {
  let history
  try {
    history = await jiraStatusHistory({ site, email, apiToken, key })
  } catch {
    /*
     * Null, not `created`. This runs up to forty times per pull on one token, so a 429 or a
     * permissions blip is ordinary — and falling back to the creation date turned a normal
     * ticket into a years-overdue one, inflating the stuck count and inventing Unstick rows.
     * Null is the "not measured" state the pill and the KPI already render honestly.
     */
    return null
  }
  // Oldest first, so the last entry into this status is the one that still holds.
  const entries = history.filter(
    (entry) => (entry.to ?? '').trim().toLowerCase() === status.trim().toLowerCase(),
  )
  // No transition into it at all means it has been there since it existed, which is true.
  return entries.length ? entries[entries.length - 1].at : (created ?? null)
}

/**
 * The board, in two passes.
 *
 * The search itself is fast — one request, and it carries everything the board needs to draw:
 * key, summary, status. What is slow is everything after it: a GitHub search to match PRs,
 * and a changelog read per aged ticket. Waiting for those before writing anything meant
 * twenty seconds of an empty page for data that was ready in one.
 *
 * So `phase: 'fast'` writes the board as soon as the search answers, marked `partial` with a
 * list of what is still missing, and `phase: 'full'` does the whole thing and overwrites it.
 * The client runs them in that order and shows skeletons where the gaps are.
 */
export async function pullJira({
  site,
  email,
  apiToken,
  jql,
  jiraBrowseUrl,
  resolvePrs,
  /** Statuses where time-in-status is worth a changelog read; empty means none are. */
  agingStatuses = [],
  /** `{ tone: [status, ...] }` from config, for the fallback chip written into the report. */
  tones = {},
  phase = 'full',
}) {
  if (!site) throw new Error('no Jira site configured — set jiraSite in config/reporto.json')
  if (!email || !apiToken) {
    throw new Error(
      'no Jira credentials — export JIRA_EMAIL and JIRA_API_TOKEN (see server/jira.mjs)',
    )
  }

  const me = await whoAmI({ site, email, apiToken })
  const issues = await searchIssues({ site, email, apiToken, jql })
  const browse = (jiraBrowseUrl || `${site.replace(/\/$/, '')}/browse`).replace(/\/$/, '')

  const fast = phase === 'fast'

  // PRs are resolved after the search, so the resolver can spend its per-ticket fallback
  // budget on the statuses that matter instead of the whole backlog.
  const ticketPrs = resolvePrs && !fast
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
      chip: statusChip(status, issue.fields?.status?.statusCategory?.name, tones),
      summary: issue.fields?.summary ?? '',
      prs: ticketPrs?.get(issue.key) ?? [],
      // An API pull has no opinion to add; notes are for a human or an agent to fill.
      notes: [],
      created: issue.fields?.created ?? null,
    }
  })

  /*
   * Four at a time, not one. These share a token with the searches above, so an unbounded
   * burst of forty is how a pull earns a 429 — but strictly sequential made this the fifteen
   * seconds the two-phase pull exists to hide. Four is well inside Jira's limits.
   */
  const aging = new Set(fast ? [] : agingStatuses.map((name) => name.trim().toLowerCase()))
  const needAging = tickets
    .filter((ticket) => aging.has(ticket.status.trim().toLowerCase()))
    .slice(0, AGING_LOOKUPS)
  const since = await pooled(needAging, AGING_CONCURRENCY, (ticket) =>
    statusSinceFor({
      site,
      email,
      apiToken,
      key: ticket.key,
      status: ticket.status,
      created: ticket.created,
    }),
  )
  needAging.forEach((ticket, at) => {
    ticket.statusSince = since[at] ?? null
  })
  for (const ticket of tickets) delete ticket.created

  // Named so a view can tell "not fetched yet" from "fetched, and there is none".
  const pending = fast
    ? [...(resolvePrs ? ['prs'] : []), ...(agingStatuses.length ? ['aging'] : [])]
    : []

  return {
    type: 'jira',
    date: new Date().toLocaleDateString('en-CA'),
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    groups: groupByStatus(tickets),
    ...(pending.length ? { partial: true, pending } : {}),
    footer:
      `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} for ` +
      `${me.displayName ?? email} from JQL` +
      (fast ? ', PRs and ages still loading.' : ', PRs matched by key in title.'),
  }
}

/**
 * Issue keys matching a JQL query, paginated. Used for month counts, where the only thing
 * wanted is "how many" — the search endpoint reports no total, so the pages are counted.
 */
export async function jiraSearchKeys({ site, email, apiToken, jql }) {
  const { base, auth } = requireAuth({ site, email, apiToken })
  const keys = []
  let nextPageToken
  do {
    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        jql,
        fields: ['key'],
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Jira search failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
    }
    const page = await res.json()
    keys.push(...(page.issues ?? []).map((issue) => issue.key))
    nextPageToken = page.nextPageToken
  } while (nextPageToken)
  return keys
}

/**
 * Every status change on one issue, oldest first. The search endpoint rejects
 * `expand: ["changelog"]`, so the history has to be asked for per issue — which is why
 * callers should sample rather than walk a whole quarter.
 */
export async function jiraStatusHistory({ site, email, apiToken, key }) {
  const { base, auth } = requireAuth({ site, email, apiToken })
  const res = await fetch(
    `${base}/rest/api/3/issue/${encodeURIComponent(key)}/changelog?maxResults=100`,
    { headers: { Authorization: auth, Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`Jira changelog for ${key} failed: ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  return (body.values ?? [])
    .flatMap((entry) =>
      (entry.items ?? [])
        .filter((item) => item.field === 'status')
        .map((item) => ({ at: entry.created, from: item.fromString, to: item.toString })),
    )
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

/** Comments per drawer. Newest first, and few enough to read rather than scroll. */
const DETAIL_COMMENTS = 5

/** The fields the drawer draws. Asked for by name so a wide issue is not fetched whole. */
const DETAIL_FIELDS =
  'summary,status,description,issuetype,priority,assignee,reporter,created,updated,labels,parent'

const personOf = (who) =>
  who ? { name: who.displayName ?? null, avatar: who.avatarUrls?.['24x24'] ?? null } : null

/**
 * One issue in full, for the ticket drawer: the description, the last few comments, and the
 * fields a card has no room for.
 *
 * Two calls rather than one — Jira will inline comments via `fields=comment`, but it returns
 * every comment on the issue with no ordering control, which on a long-running ticket is a
 * hundred entries to transfer for the five that get read. The `/comment` endpoint takes
 * `orderBy` and `maxResults`.
 *
 * Bodies come back as Atlassian Document Format, and are passed through untouched: the client
 * has the renderer, and flattening ADF to text here would throw away the links and code blocks
 * that make a description worth reading in place.
 */
export async function jiraIssueDetail({
  site,
  email,
  apiToken,
  key,
  comments = DETAIL_COMMENTS,
  browseUrl,
  tones = {},
}) {
  const { base, auth } = requireAuth({ site, email, apiToken })
  const headers = { Authorization: auth, Accept: 'application/json' }

  const issueRes = await fetch(
    `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${DETAIL_FIELDS}`,
    { headers },
  )
  if (issueRes.status === 404) throw new Error(`no such ticket: ${key}`)
  if (!issueRes.ok) {
    throw new Error(`Jira issue ${key} failed: ${issueRes.status} ${issueRes.statusText}`)
  }
  const issue = await issueRes.json()
  const fields = issue.fields ?? {}

  // A ticket with an unreadable comment list is still worth opening, so this half fails soft.
  let commentList = []
  try {
    const res = await fetch(
      `${base}/rest/api/3/issue/${encodeURIComponent(key)}/comment` +
        `?orderBy=-created&maxResults=${Math.max(1, Math.min(20, comments))}`,
      { headers },
    )
    if (res.ok) {
      const body = await res.json()
      commentList = (body.comments ?? []).map((comment) => ({
        id: String(comment.id),
        author: personOf(comment.author),
        at: comment.created ?? null,
        body: comment.body ?? null,
      }))
    }
  } catch {
    commentList = []
  }

  const status = fields.status?.name ?? 'unknown'
  return {
    key: issue.key ?? key,
    url: `${(browseUrl ?? `${base}/browse`).replace(/\/$/, '')}/${issue.key ?? key}`,
    summary: fields.summary ?? '',
    status,
    chip: statusChip(status, fields.status?.statusCategory?.name, tones),
    type: fields.issuetype?.name ?? null,
    priority: fields.priority?.name ?? null,
    assignee: personOf(fields.assignee),
    reporter: personOf(fields.reporter),
    created: fields.created ?? null,
    updated: fields.updated ?? null,
    labels: fields.labels ?? [],
    parent: fields.parent
      ? { key: fields.parent.key, summary: fields.parent.fields?.summary ?? '' }
      : null,
    description: fields.description ?? null,
    comments: commentList,
  }
}
