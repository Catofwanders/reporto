import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStandup, windowStart } from './standup.mjs'

const SITE = 'https://jira.example.com'

const at = (iso) => new Date(iso)

/*
 * These tests are *about* local time, so they have to name the zone rather than inherit it.
 *
 * The first version inherited it, and so encoded the machine it was written on: the instant
 * `2026-05-20T00:30:00+03:00` is the 20th in Kyiv and the 19th in UTC, which makes the window
 * start the 19th on this laptop and the 18th on a CI runner. It passed locally and failed in
 * CI — the wrong way round for a test whose whole point is that the code reads *local* dates,
 * a claim that only means something against a stated zone.
 *
 * Node re-reads `process.env.TZ` per call, so setting it around a block is enough.
 */
const inZone = (tz, run) => {
  const before = process.env.TZ
  process.env.TZ = tz
  try {
    return run()
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

describe('windowStart', () => {
  /* Monday looks back to Friday morning, so the weekend's work is still in the note. */
  it('reaches back to Friday on a Monday, in any zone', () => {
    for (const [tz, iso] of [
      ['Europe/Kyiv', '2026-05-18T09:30:00+03:00'],
      ['UTC', '2026-05-18T09:30:00Z'],
      ['America/New_York', '2026-05-18T09:30:00-04:00'],
    ]) {
      inZone(tz, () => {
        const start = windowStart(at(iso))
        expect(start.getDay()).toBe(5)
        expect(start.getDate()).toBe(15)
        expect([start.getHours(), start.getMinutes()]).toEqual([0, 0])
      })
    }
  })

  it('reaches back to yesterday on every other day', () => {
    inZone('UTC', () => {
      for (const [day, expected] of [
        ['2026-05-19T09:00:00Z', 18],
        ['2026-05-20T09:00:00Z', 19],
        ['2026-05-23T09:00:00Z', 22],
        ['2026-05-24T09:00:00Z', 23],
      ]) {
        expect(windowStart(at(day)).getDate()).toBe(expected)
      }
    })
  })

  /*
   * The weekly wrap. On a Monday the useful answer is the week that just ended rather than
   * the six hours since midnight, and Sunday belongs to the week that is ending.
   */
  it('reaches back to Monday for the week span', () => {
    inZone('UTC', () => {
      // Wednesday 20 May 2026 → Monday 18th.
      expect(windowStart(at('2026-05-20T09:00:00Z'), 'week').getDate()).toBe(18)
      // Friday 22nd → the same Monday.
      expect(windowStart(at('2026-05-22T18:00:00Z'), 'week').getDate()).toBe(18)
      // Monday 18th → the previous Monday, 11th, not today.
      expect(windowStart(at('2026-05-18T09:00:00Z'), 'week').getDate()).toBe(11)
      // Sunday 24th → Monday 18th, the week it closes.
      expect(windowStart(at('2026-05-24T12:00:00Z'), 'week').getDate()).toBe(18)
    })
  })

  it('starts at local midnight, not at the current time', () => {
    inZone('Europe/Kyiv', () => {
      const start = windowStart(at('2026-05-20T23:45:00+03:00'))
      expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0])
    })
  })
})

describe('readStandup', () => {
  /*
   * `gh` is unreachable for every test in here. The stand-up reads Jira over fetch and GitHub
   * through `gh`, and a test that leaves the second one alone runs the real binary against the
   * real network — which is how a suite starts depending on a keyring and a VPN.
   */
  let noGh
  let realPath

  beforeEach(() => {
    noGh = fs.mkdtempSync(path.join(os.tmpdir(), 'reporto-nogh-'))
    realPath = process.env.PATH
    process.env.PATH = noGh
  })

  afterEach(() => {
    process.env.PATH = realPath
    fs.rmSync(noGh, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  const stub = ({ keys = [], history = {} } = {}) => {
    const jql = []
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = String(url).replace(SITE, '')
      const json = (body) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      if (path.startsWith('/rest/api/3/search/jql')) {
        jql.push(JSON.parse(String(options.body)).jql)
        return json({ issues: keys.map((key) => ({ key })), isLast: true })
      }
      const match = /\/rest\/api\/3\/issue\/([^/?]+)\/changelog/.exec(path)
      if (match) return json({ values: history[match[1]] ?? [] })
      throw new Error(`unexpected request: ${path}`)
    })
    return jql
  }

  /*
   * The date in the JQL is the *local* calendar date. `windowStart` returns local midnight,
   * and `toISOString().slice(0, 10)` on that instant is the previous day at any positive
   * offset — so the window opened a day early and Sunday work was reported as "since
   * yesterday".
   */
  it('asks Jira for the local calendar date of the window start', async () => {
    const jql = stub()
    /*
     * Half past midnight local, at a positive offset — the case the local-date rule exists
     * for. `toISOString().slice(0, 10)` of that instant is the *previous* day, so the window
     * would open a day early and Sunday's work would be reported as "since yesterday". The
     * zone is named rather than inherited, or the assertion is about the machine.
     */
    const report = await inZone('Europe/Kyiv', () =>
      readStandup({
        jiraSite: SITE,
        jiraEmail: 'me@example.com',
        jiraApiToken: 'token',
        now: at('2026-05-20T00:30:00+03:00'),
      }),
    )
    expect(report.since).toBe('2026-05-19')
    expect(jql[0]).toContain('status changed AFTER "2026-05-19"')
  })

  /* The same instant read in UTC is the day before, and the window is one day earlier. */
  it('follows the machine’s own zone rather than UTC', async () => {
    const jql = stub()
    const report = await inZone('UTC', () =>
      readStandup({
        jiraSite: SITE,
        jiraEmail: 'me@example.com',
        jiraApiToken: 'token',
        now: at('2026-05-20T00:30:00+03:00'),
      }),
    )
    expect(report.since).toBe('2026-05-18')
    expect(jql[0]).toContain('status changed AFTER "2026-05-18"')
  })

  it('reports the week window and says which span it used', async () => {
    const jql = stub()
    const report = await readStandup({
      jiraSite: SITE,
      jiraEmail: 'me@example.com',
      jiraApiToken: 'token',
      now: at('2026-05-20T09:00:00+02:00'),
      span: 'week',
    })
    expect(report.since).toBe('2026-05-18')
    expect(report.span).toBe('week')
    expect(jql[0]).toContain('status changed AFTER "2026-05-18"')
  })

  it('reports the first and last status of the window, not every hop', async () => {
    stub({
      keys: ['SHOP-1'],
      history: {
        'SHOP-1': [
          { created: '2026-05-19T09:00:00+02:00', items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
          { created: '2026-05-19T15:00:00+02:00', items: [{ field: 'status', fromString: 'In Progress', toString: 'In Review' }] },
        ],
      },
    })
    const report = await readStandup({
      jiraSite: SITE,
      jiraEmail: 'me@example.com',
      jiraApiToken: 'token',
      now: at('2026-05-20T09:00:00+02:00'),
    })
    expect(report.moved).toEqual([
      { key: 'SHOP-1', from: 'To Do', to: 'In Review', steps: 2, at: '2026-05-19T15:00:00+02:00' },
    ])
  })

  it('ignores transitions from before the window', async () => {
    stub({
      keys: ['SHOP-1'],
      history: {
        'SHOP-1': [
          { created: '2026-05-01T09:00:00+02:00', items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
        ],
      },
    })
    const report = await readStandup({
      jiraSite: SITE,
      jiraEmail: 'me@example.com',
      jiraApiToken: 'token',
      now: at('2026-05-20T09:00:00+02:00'),
    })
    expect(report.moved).toEqual([])
  })

  /* A failed half must be named in the note rather than read as "nothing moved". */
  it('names a failing source instead of reporting an empty day', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }))
    const report = await readStandup({
      jiraSite: SITE,
      jiraEmail: 'me@example.com',
      jiraApiToken: 'token',
      now: at('2026-05-20T09:00:00+02:00'),
    })
    expect(report.moved).toEqual([])
    expect(report.notes.join(' ')).toMatch(/jira:/)
    expect(report.notes.join(' ')).toMatch(/github:/)
  })
})
