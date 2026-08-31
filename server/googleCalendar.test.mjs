import { afterEach, describe, expect, it, vi } from 'vitest'
import { pullGoogleCalendar } from './googleCalendar.mjs'

const OAUTH = {
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'refresh',
  calendarIds: ['work@example.com'],
}

/** Today and neighbours as local dates, since that is what an all-day entry carries. */
const localDate = (offsetDays = 0) => {
  const at = new Date()
  at.setDate(at.getDate() + offsetDays)
  return at.toLocaleDateString('en-CA')
}

/** A local wall-clock time today, in the offset Google would send back. */
const todayAt = (hour) => {
  const at = new Date()
  at.setHours(hour, 0, 0, 0)
  const offset = -at.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return `${at.toLocaleDateString('en-CA')}T${pad(hour)}:00:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}

function stubGoogle({ items = [], calendars = { 'work@example.com': 'Work' }, calendarFails = [] }) {
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const href = String(url)
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    if (href.includes('oauth2') || href.includes('token')) {
      expect(options.method).toBe('POST')
      return json({ access_token: 'access' })
    }
    const events = /\/calendars\/([^/]+)\/events/.exec(href)
    if (events) return json({ items })
    const one = /\/calendars\/([^/?]+)/.exec(href)
    if (one) {
      const id = decodeURIComponent(one[1])
      if (calendarFails.includes(id)) return json({ error: 'not found' }, 404)
      return json({ summary: calendars[id] ?? id })
    }
    throw new Error(`unexpected request: ${href}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pullGoogleCalendar', () => {
  it('puts a meeting that starts today on today', async () => {
    stubGoogle({
      items: [
        { summary: 'Stand-up', start: { dateTime: todayAt(9) }, end: { dateTime: todayAt(10) } },
      ],
    })
    const report = await pullGoogleCalendar(OAUTH)
    expect(report.events.map((e) => e.title)).toEqual(['Stand-up'])
    expect(report.upcoming).toEqual([])
  })

  /*
   * The bug: `new Date('2026-08-28')` is UTC midnight, so at a positive offset an all-day
   * entry read as starting the evening before — and yesterday's all-day block, whose
   * exclusive end date *is* today, showed up as today's.
   */
  it('keeps an all-day entry that ended yesterday off today', async () => {
    stubGoogle({
      items: [
        {
          summary: 'Someone on leave',
          start: { date: localDate(-1) },
          end: { date: localDate(0) },
        },
      ],
    })
    const report = await pullGoogleCalendar(OAUTH)
    expect(report.events).toEqual([])
    expect(report.upcoming.map((e) => e.title)).toEqual(['Someone on leave'])
  })

  it('puts a today all-day entry on today, with no fake midnight time', async () => {
    stubGoogle({
      items: [{ summary: 'Company day', start: { date: localDate(0) }, end: { date: localDate(1) } }],
    })
    const [event] = (await pullGoogleCalendar(OAUTH)).events
    expect(event.kind).toBe('all-day')
    // Null rather than a timestamp: a bare date rendered as midnight, at the top of the day.
    expect(event.start).toBeNull()
    expect(event.end).toBeNull()
    expect(event.note).toContain(localDate(0))
  })

  /* Declining an invitation is a statement that it is not on your day. */
  it('skips an invitation I declined, and anything cancelled', async () => {
    stubGoogle({
      items: [
        {
          summary: 'Declined thing',
          start: { dateTime: todayAt(11) },
          end: { dateTime: todayAt(12) },
          attendees: [{ self: true, responseStatus: 'declined' }],
        },
        {
          summary: 'Cancelled thing',
          status: 'cancelled',
          start: { dateTime: todayAt(13) },
          end: { dateTime: todayAt(14) },
        },
        { summary: 'Kept', start: { dateTime: todayAt(15) }, end: { dateTime: todayAt(16) } },
      ],
    })
    const report = await pullGoogleCalendar(OAUTH)
    expect(report.events.map((e) => e.title)).toEqual(['Kept'])
  })

  it('sorts today by start time', async () => {
    stubGoogle({
      items: [
        { summary: 'Later', start: { dateTime: todayAt(15) }, end: { dateTime: todayAt(16) } },
        { summary: 'Earlier', start: { dateTime: todayAt(9) }, end: { dateTime: todayAt(10) } },
      ],
    })
    const report = await pullGoogleCalendar(OAUTH)
    expect(report.events.map((e) => e.title)).toEqual(['Earlier', 'Later'])
  })

  it('prefers the conferencing link over the calendar page', async () => {
    stubGoogle({
      items: [
        {
          summary: 'Call',
          start: { dateTime: todayAt(9) },
          end: { dateTime: todayAt(10) },
          htmlLink: 'https://calendar.google.com/event',
          hangoutLink: 'https://meet.example.com/abc',
        },
      ],
    })
    expect((await pullGoogleCalendar(OAUTH)).events[0].url).toBe('https://meet.example.com/abc')
  })

  /* One calendar that was never shared must not sink the rest of the day. */
  it('skips an unreadable calendar and keeps the readable one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGoogle({
      items: [{ summary: 'Kept', start: { dateTime: todayAt(9) }, end: { dateTime: todayAt(10) } }],
      calendars: { 'work@example.com': 'Work' },
      calendarFails: ['gone@example.com'],
    })
    const report = await pullGoogleCalendar({
      ...OAUTH,
      calendarIds: ['gone@example.com', 'work@example.com'],
    })
    expect(report.summary).toContain('1 calendar')
  })

  it('says what is missing instead of returning an empty day', async () => {
    await expect(pullGoogleCalendar({ calendarIds: ['x'] })).rejects.toThrow(
      /no Google credentials/,
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGoogle({ calendarFails: ['gone@example.com'] })
    await expect(
      pullGoogleCalendar({ ...OAUTH, calendarIds: ['gone@example.com'] }),
    ).rejects.toThrow(/can read no calendars|no readable calendars/)
  })
})
