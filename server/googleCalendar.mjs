/**
 * Google Calendar via the v3 API.
 *
 * A plain API key cannot read a private calendar — Google only accepts keys for public
 * data — so authentication is one of two things:
 *
 *   1. A service-account key (preferred). Share the calendar with the service account's
 *      email the way you would with a colleague, and this signs its own token. No browser,
 *      no consent screen, no expiring refresh token.
 *   2. An installed-app refresh token, from `npm run google-auth`. Needed when a calendar
 *      cannot be shared with the service account — you can only share what you own or have
 *      manage-sharing rights on, which for a team calendar is often not you.
 *
 * Recurrence is Google's problem, not ours: singleEvents=true expands the stand-up and the
 * kick-offs into concrete instances, which is why this needs no iCal parser.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { fetchWithTimeout } from './http.mjs'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/** Events whose summary reads like a kick-off get their own kind, as the report shows them apart. */
const KICKOFF = /kick[\s-]?off/i

const b64url = (input) => Buffer.from(input).toString('base64url')

/** The key as an object, whether the env var holds a path or the JSON itself. */
function readServiceAccount(value) {
  const raw = value.trim().startsWith('{') ? value : fs.readFileSync(value, 'utf8')
  const key = JSON.parse(raw)
  if (!key.client_email || !key.private_key) {
    throw new Error('service account key has no client_email / private_key')
  }
  return key
}

/**
 * Signed JWT assertion, self-issued and traded for an access token. This is what makes the
 * service-account path key-only: nothing interactive, nothing to refresh by hand.
 */
async function serviceAccountToken(value) {
  const key = readServiceAccount(value)
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri ?? TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(key.private_key)
    .toString('base64url')

  const res = await fetchWithTimeout(key.token_uri ?? TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `Google service-account token failed: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`,
    )
  }
  return body.access_token
}

async function refreshedToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    // invalid_grant is the one worth naming: a Testing-status OAuth app expires refresh
    // tokens after seven days, which otherwise reads as a mysterious auth failure.
    const hint =
      body.error === 'invalid_grant'
        ? ' — the refresh token was revoked or expired. Apps left in "Testing" publishing status expire it after 7 days; re-run npm run google-auth, or set the consent screen to Internal/In production.'
        : ''
    throw new Error(`Google token exchange failed: ${res.status} ${body.error ?? ''}${hint}`)
  }
  return body.access_token
}

async function api(path, token, params = {}) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google ${path} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Which calendars to read.
 *
 * Explicit ids come first, and a service account needs them: sharing a calendar with its
 * address grants access but does not add the calendar to the service account's own
 * calendarList, so listing that returns nothing. Addressing the calendar by id works.
 *
 * With no ids configured, fall back to calendarList — which is what the OAuth path wants,
 * since a real user's list is populated and includes calendars they merely subscribe to.
 */
async function calendars(token, { ids = [], include = [], exclude = [] }) {
  if (ids.length) {
    const found = []
    for (const id of ids) {
      try {
        const cal = await api(`/calendars/${encodeURIComponent(id)}`, token)
        found.push({ id, summary: cal.summary ?? id })
      } catch (err) {
        // One unreadable calendar must not sink the rest — it is usually one that was
        // never shared with the service account.
        console.warn(`[reporto] calendar ${id} unreadable: ${String(err.message ?? err)}`)
      }
    }
    return found.filter((cal) => !exclude.includes(cal.summary))
  }

  const { items = [] } = await api('/users/me/calendarList', token, {
    minAccessRole: 'reader',
    showHidden: 'false',
  })
  return items
    .filter((cal) => !cal.deleted && cal.selected !== false)
    .filter((cal) => (include.length ? include.includes(cal.summary) : true))
    .filter((cal) => !exclude.includes(cal.summary))
}

const isAllDay = (event) => Boolean(event.start?.date)

/** The join link, in the order a reader would want it: conferencing first, page last. */
function eventUrl(event) {
  const entry = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')
  return event.hangoutLink ?? entry?.uri ?? event.location ?? event.htmlLink ?? undefined
}

function toEvent(event, calendarName) {
  const allDay = isAllDay(event)
  return {
    source: 'google',
    calendar: calendarName,
    title: event.summary ?? '(no title)',
    kind: allDay ? 'all-day' : KICKOFF.test(event.summary ?? '') ? 'kickoff' : 'meeting',
    // All-day entries carry a date, not a timestamp; the report models those as null and
    // keeps the dates in the note, since a bare date renders as midnight otherwise.
    start: allDay ? null : (event.start?.dateTime ?? null),
    end: allDay ? null : (event.end?.dateTime ?? null),
    url: eventUrl(event),
    note: allDay ? allDayNote(event) : (event.description?.split('\n')[0]?.slice(0, 200) || undefined),
  }
}

/** "13–15 May" style span for an all-day entry; Google's end date is exclusive. */
function allDayNote(event) {
  const from = event.start?.date
  const to = event.end?.date
  if (!from) return undefined
  const last = to ? new Date(new Date(to).getTime() - 86_400_000).toISOString().slice(0, 10) : from
  return last === from ? `All day ${from}` : `${from} – ${last}`
}

const dayBounds = (date) => {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start.getTime() + 86_400_000)
  return { start, end }
}

export async function pullGoogleCalendar({
  serviceAccount,
  calendarIds,
  clientId,
  clientSecret,
  refreshToken,
  include,
  exclude,
  upcomingDays = 7,
}) {
  const token = serviceAccount
    ? await serviceAccountToken(serviceAccount)
    : clientId && clientSecret && refreshToken
      ? await refreshedToken({ clientId, clientSecret, refreshToken })
      : null
  if (!token) {
    throw new Error(
      'no Google credentials — set GOOGLE_SERVICE_ACCOUNT_KEY to the JSON key file, and share each calendar with the service account email. (Or use the OAuth path: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN via npm run google-auth.)',
    )
  }
  const cals = await calendars(token, { ids: calendarIds ?? [], include, exclude })
  if (cals.length === 0) {
    throw new Error(
      serviceAccount
        ? 'the service account can read no calendars — set calendarIds in config/reporto.json to the calendar addresses, and share each with its client_email (Share with specific people). A service account cannot enumerate calendars, only address them by id.'
        : 'no readable calendars matched the config filters',
    )
  }

  const date = new Date().toLocaleDateString('en-CA')
  const { start: todayStart, end: todayEnd } = dayBounds(date)
  const horizon = new Date(todayStart.getTime() + (upcomingDays + 1) * 86_400_000)

  const events = []
  const upcoming = []
  for (const cal of cals) {
    const { items = [] } = await api(`/calendars/${encodeURIComponent(cal.id)}/events`, token, {
      timeMin: todayStart.toISOString(),
      timeMax: horizon.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: 250,
    })
    for (const item of items) {
      if (item.status === 'cancelled') continue
      // Declining an invitation is a statement that it is not on your day.
      const me = item.attendees?.find((a) => a.self)
      if (me?.responseStatus === 'declined') continue

      const mapped = toEvent(item, cal.summaryOverride ?? cal.summary ?? cal.id)
      const at = new Date(item.start?.dateTime ?? `${item.start?.date}T00:00:00`)
      // `T00:00:00` on the bare date too: `new Date('2026-08-28')` is parsed as UTC midnight,
      // so at a positive offset yesterday's all-day event ended "today" and showed up here.
      const endsAt = new Date(
        item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T00:00:00` : at),
      )
      const today = at < todayEnd && endsAt > todayStart
      ;(today ? events : upcoming).push(mapped)
    }
  }

  /*
   * Google only, and the report says exactly what Google said.
   *
   * This used to merge in every non-Google event from the previous report, so that a pull
   * could not delete the Outlook meetings no server can read. The failure mode was worse than
   * the problem: once nothing was writing those events any more, the merge kept re-copying a
   * stale recurring meeting into every report, and a calendar claiming a meeting nobody has
   * verified in a week is worse than a calendar that admits it only knows Google.
   */
  const sortKey = (event) => event.start ?? '￿'
  const allToday = [...events].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

  return {
    type: 'calendar',
    date,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    events: allToday,
    upcoming: upcoming.sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    summary:
      `${allToday.length} today across ${cals.length} calendar${cals.length === 1 ? '' : 's'}` +
      `; ${upcoming.length} in the next ${upcomingDays} days.`,
  }
}

/**
 * Time actually spent in meetings, per month range. All-day entries are skipped: a
 * week-long "vacation" block is not eight hours a day of meetings, and counting it would
 * swamp every real number. Declined invitations are skipped for the same reason they are
 * skipped in the day report — declining says it was not your meeting.
 *
 * Google is asked once per calendar per range, so keep the range list short.
 */
export async function pullMeetingLoad({
  serviceAccount,
  calendarIds,
  clientId,
  clientSecret,
  refreshToken,
  include,
  exclude,
  ranges = [],
}) {
  const token = serviceAccount
    ? await serviceAccountToken(serviceAccount)
    : clientId && clientSecret && refreshToken
      ? await refreshedToken({ clientId, clientSecret, refreshToken })
      : null
  if (!token) throw new Error('no Google credentials for the meeting load')

  const cals = await calendars(token, { ids: calendarIds ?? [], include, exclude })
  if (cals.length === 0) throw new Error('no readable calendars for the meeting load')

  const out = []
  for (const range of ranges) {
    let hours = 0
    let count = 0
    for (const cal of cals) {
      const { items = [] } = await api(`/calendars/${encodeURIComponent(cal.id)}/events`, token, {
        timeMin: new Date(`${range.from}T00:00:00Z`).toISOString(),
        timeMax: new Date(`${range.to}T23:59:59Z`).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: 2500,
      })
      for (const item of items) {
        if (item.status === 'cancelled' || isAllDay(item)) continue
        const me = item.attendees?.find((a) => a.self)
        if (me?.responseStatus === 'declined') continue
        const start = item.start?.dateTime
        const end = item.end?.dateTime
        if (!start || !end) continue
        hours += (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000
        count += 1
      }
    }
    out.push({ month: range.month, hours: Math.round(hours * 10) / 10, count })
  }
  return out
}
