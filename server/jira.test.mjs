import { afterEach, describe, expect, it, vi } from 'vitest'
import { pullJira } from './jira.mjs'

const SITE = 'https://jira.example.com'
const AUTH = { site: SITE, email: 'me@example.com', apiToken: 'token' }
const ME = 'acct-me'

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString()
const daysAgo = (d) => hoursAgo(d * 24)

const text = (value) => ({ type: 'text', text: value })
const paragraph = (...content) => ({ type: 'paragraph', content })
const doc = (...content) => ({ type: 'doc', version: 1, content })

const change = (field, from, to, { at = hoursAgo(3), author = 'acct-other', name = 'A teammate', id = '1', toId } = {}) => ({
  id,
  created: at,
  author: { accountId: author, displayName: name, avatarUrls: { '24x24': 'https://a/24.png' } },
  items: [{ field, fromString: from, toString: to, ...(toId ? { to: toId } : {}) }],
})

const issue = (key, status, summary = `${key} summary`) => ({
  key,
  fields: { summary, status: { name: status, statusCategory: { name: 'In Progress' } }, created: daysAgo(40) },
})

const comment = (id, { author = 'acct-other', name = 'A teammate', at = hoursAgo(2), body }) => ({
  id,
  author: { accountId: author, displayName: name, avatarUrls: { '24x24': 'https://a/24.png' } },
  created: at,
  body,
})

/**
 * A fake Jira, routed by path. Stubbing `fetch` rather than any module inside the puller is
 * deliberate: the code under test then includes the URL building, the pagination and the
 * error handling, which is where the bugs actually were.
 */
function stubJira({ issues = [], comments = {}, changelog = {}, fail = () => false }) {
  const calls = []
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const path = String(url).replace(SITE, '')
    calls.push(path)
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    if (path.startsWith('/rest/api/3/myself')) return json({ accountId: ME, displayName: 'Me' })
    if (path.startsWith('/rest/api/3/search/jql')) {
      expect(options.method).toBe('POST')
      return json({ issues, isLast: true })
    }
    const match = /\/rest\/api\/3\/issue\/([^/?]+)\/(comment|changelog)/.exec(path)
    if (match) {
      const [, key, what] = match
      if (fail(key, what)) return json({ errorMessages: ['boom'] }, 500)
      if (what === 'comment') return json({ comments: comments[key] ?? [] })
      return json({ values: changelog[key] ?? [] })
    }
    throw new Error(`unexpected request: ${path}`)
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pullJira activity', () => {
  it('keeps comments other people wrote and drops my own', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress')],
      comments: {
        'SHOP-1': [
          comment('9001', { body: doc(paragraph(text('theirs'))) }),
          comment('9002', { author: ME, name: 'Me', body: doc(paragraph(text('mine'))) }),
        ],
      },
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.activity.map((item) => item.excerpt)).toEqual(['theirs'])
    // `<KEY>:<commentId>`, because the client's dismissal has to survive a refetch.
    expect(report.activity[0].id).toBe('SHOP-1:9001')
  })

  /* Fourteen days is the window; older than that is history, however unread it is. */
  it('drops comments older than the window', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress')],
      comments: {
        'SHOP-1': [
          comment('1', { at: daysAgo(3), body: doc(paragraph(text('recent'))) }),
          comment('2', { at: daysAgo(20), body: doc(paragraph(text('ancient'))) }),
        ],
      },
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.activity.map((item) => item.excerpt)).toEqual(['recent'])
  })

  /*
   * By accountId, never by display name: two colleagues sharing a first name would otherwise
   * put someone else's mention in my queue.
   */
  it('detects a mention by accountId and not by name', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress'), issue('SHOP-2', 'In Progress')],
      comments: {
        'SHOP-1': [
          comment('1', {
            body: doc(paragraph({ type: 'mention', attrs: { id: ME, text: '@Me' } }, text(' look'))),
          }),
        ],
        'SHOP-2': [
          comment('2', {
            body: doc(
              paragraph({ type: 'mention', attrs: { id: 'acct-someone', text: '@Me' } }, text(' look')),
            ),
          }),
        ],
      },
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    const byTicket = Object.fromEntries(report.activity.map((item) => [item.ticket, item.mentionsMe]))
    expect(byTicket).toEqual({ 'SHOP-1': true, 'SHOP-2': false })
  })

  it('flattens ADF to one line, keeping mentions and link targets', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress')],
      comments: {
        'SHOP-1': [
          comment('1', {
            body: doc(
              paragraph({ type: 'mention', attrs: { text: '@Me' } }, text(' see')),
              paragraph({ type: 'inlineCard', attrs: { url: 'https://example.com/x' } }),
              paragraph(text('then'), { type: 'hardBreak' }, text('this')),
            ),
          }),
        ],
      },
    })
    const [item] = (await pullJira({ ...AUTH, jql: 'x' })).activity
    expect(item.excerpt).toBe('@Me see https://example.com/x then this')
  })

  it('caps a long comment rather than shipping the whole thing to a row', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress')],
      comments: { 'SHOP-1': [comment('1', { body: doc(paragraph(text('x'.repeat(600)))) })] },
    })
    const [item] = (await pullJira({ ...AUTH, jql: 'x' })).activity
    expect(item.excerpt.length).toBeLessThanOrEqual(240)
    expect(item.excerpt.endsWith('…')).toBe(true)
  })

  /*
   * A ticket whose comments would not load is not a ticket with no comments. Saying nothing
   * would present a failed read as silence, which is the one thing an unread queue must not do.
   */
  it('counts tickets whose comments could not be read', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress'), issue('SHOP-2', 'In Progress')],
      comments: { 'SHOP-1': [comment('1', { body: doc(paragraph(text('hello'))) })] },
      fail: (key, what) => key === 'SHOP-2' && what === 'comment',
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.activity).toHaveLength(1)
    expect(report.activityNote).toBe('1 ticket could not be read')
  })

  it('sorts newest first', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Progress')],
      comments: {
        'SHOP-1': [
          comment('old', { at: daysAgo(5), body: doc(paragraph(text('old'))) }),
          comment('new', { at: hoursAgo(1), body: doc(paragraph(text('new'))) }),
        ],
      },
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.activity.map((item) => item.excerpt)).toEqual(['new', 'old'])
  })

  /* The fast pass must name activity pending, or an empty panel reads as "nothing new". */
  it('skips comments in the fast phase and says they are pending', async () => {
    const calls = stubJira({ issues: [issue('SHOP-1', 'In Progress')] })
    const report = await pullJira({ ...AUTH, jql: 'x', phase: 'fast' })
    expect(report.activity).toBeUndefined()
    expect(report.pending).toContain('activity')
    expect(report.partial).toBe(true)
    expect(calls.some((path) => path.includes('/comment'))).toBe(false)
  })
})

describe('pullJira changes', () => {
  it('reports a status move somebody else made', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: { 'SHOP-1': [change('status', 'In Progress', 'In Review')] },
    })
    const [item] = (await pullJira({ ...AUTH, jql: 'x' })).activity
    expect(item.kind).toBe('change')
    expect(item.field).toBe('status')
    expect(item.excerpt).toBe('moved it from In Progress to In Review')
    expect(item.author).toBe('A teammate')
  })

  it('ignores my own changes', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: { 'SHOP-1': [change('status', 'In Progress', 'In Review', { author: ME })] },
    })
    expect((await pullJira({ ...AUTH, jql: 'x' })).activity).toEqual([])
  })

  it('ignores changes older than the window', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: { 'SHOP-1': [change('status', 'To Do', 'In Review', { at: daysAgo(30) })] },
    })
    expect((await pullJira({ ...AUTH, jql: 'x' })).activity).toEqual([])
  })

  /*
   * A board generates edits nobody wants a notification for — description tweaks, backlog
   * rank, summary rewording. A queue carrying all of them is a queue nobody reads.
   */
  it('ignores fields that are not worth a notification', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: {
        'SHOP-1': [
          change('description', 'old', 'new'),
          change('Rank', null, 'higher', { id: '2' }),
          change('summary', 'a', 'b', { id: '3' }),
        ],
      },
    })
    expect((await pullJira({ ...AUTH, jql: 'x' })).activity).toEqual([])
  })

  /* Being handed a ticket is the strongest "this is yours now" signal Jira has. */
  it('counts being assigned the ticket as a mention, by accountId', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review'), issue('SHOP-2', 'In Review')],
      changelog: {
        'SHOP-1': [change('assignee', 'A teammate', 'Me', { toId: ME })],
        'SHOP-2': [change('assignee', 'A teammate', 'Someone else', { toId: 'acct-third' })],
      },
    })
    const byTicket = Object.fromEntries(
      (await pullJira({ ...AUTH, jql: 'x' })).activity.map((item) => [item.ticket, item.mentionsMe]),
    )
    expect(byTicket).toEqual({ 'SHOP-1': true, 'SHOP-2': false })
  })

  it('says each kind of change in words', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: {
        'SHOP-1': [
          change('priority', 'Medium', 'High', { id: '1' }),
          change('assignee', 'A teammate', null, { id: '2' }),
          change('resolution', null, 'Done', { id: '3' }),
          change('duedate', null, '2026-06-01', { id: '4' }),
          change('Sprint', null, 'Sprint 14', { id: '5' }),
        ],
      },
    })
    const said = (await pullJira({ ...AUTH, jql: 'x' })).activity.map((item) => item.excerpt).sort()
    expect(said).toEqual([
      'moved it into Sprint 14',
      'resolved it as Done',
      'set priority to High',
      'set the due date to 2026-06-01',
      'took the assignee off it',
    ].sort())
  })

  it('mixes comments and changes into one list, newest first', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      comments: { 'SHOP-1': [comment('9001', { at: hoursAgo(1), body: doc(paragraph(text('a comment'))) })] },
      changelog: { 'SHOP-1': [change('status', 'To Do', 'In Review', { at: hoursAgo(5) })] },
    })
    const activity = (await pullJira({ ...AUTH, jql: 'x' })).activity
    expect(activity.map((item) => item.kind)).toEqual(['comment', 'change'])
  })

  it('counts a ticket whose changelog would not load', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      fail: (_key, what) => what === 'changelog',
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.activityNote).toBe('1 ticket could not be read')
  })

  it('gives each change a stable id, per entry and per field', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: {
        'SHOP-1': [
          {
            id: '55',
            created: hoursAgo(2),
            author: { accountId: 'acct-other', displayName: 'A teammate' },
            items: [
              { field: 'status', fromString: 'To Do', toString: 'In Review' },
              { field: 'priority', fromString: 'Low', toString: 'High' },
            ],
          },
        ],
      },
    })
    const ids = (await pullJira({ ...AUTH, jql: 'x' })).activity.map((item) => item.id)
    expect(ids).toEqual(['SHOP-1:change:55:status', 'SHOP-1:change:55:priority'])
  })
})

describe('pullJira aging', () => {
  it('dates a ticket from the last transition into its current status', async () => {
    const at = daysAgo(4)
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      changelog: {
        'SHOP-1': [
          { created: daysAgo(9), items: [{ field: 'status', fromString: 'To Do', toString: 'In Review' }] },
          { created: daysAgo(6), items: [{ field: 'status', fromString: 'In Review', toString: 'In Progress' }] },
          { created: at, items: [{ field: 'status', fromString: 'In Progress', toString: 'In Review' }] },
        ],
      },
    })
    const report = await pullJira({ ...AUTH, jql: 'x', agingStatuses: ['In Review'] })
    expect(report.groups[0].tickets[0].statusSince).toBe(at)
  })

  /*
   * Null, not the creation date. Falling back to `created` on a failed changelog read turned
   * an ordinary ticket into a years-overdue one and invented Unstick rows out of a 429.
   */
  it('reports an unreadable changelog as unmeasured rather than as ancient', async () => {
    stubJira({
      issues: [issue('SHOP-1', 'In Review')],
      fail: (_key, what) => what === 'changelog',
    })
    const report = await pullJira({ ...AUTH, jql: 'x', agingStatuses: ['In Review'] })
    expect(report.groups[0].tickets[0].statusSince).toBeNull()
  })

  /*
   * The changelog is read for every scanned ticket now, because the activity feed needs it —
   * but only an aged status gets a measured date. Unmeasured has to stay absent rather than
   * become a zero.
   */
  it('leaves a status nobody asked to age unmeasured', async () => {
    stubJira({ issues: [issue('SHOP-1', 'Backlog')] })
    const report = await pullJira({ ...AUTH, jql: 'x', agingStatuses: ['In Review'] })
    expect(report.groups[0].tickets[0].statusSince).toBeUndefined()
  })

  it('reads no changelog at all in the fast phase', async () => {
    const calls = stubJira({ issues: [issue('SHOP-1', 'In Review')] })
    await pullJira({ ...AUTH, jql: 'x', agingStatuses: ['In Review'], phase: 'fast' })
    expect(calls.some((path) => path.includes('/changelog'))).toBe(false)
  })

  /*
   * Aged tickets are scanned first. A board longer than the cap would otherwise measure
   * whatever the JQL happened to rank first, which is not what the age pill is for.
   */
  it('scans aged tickets before the rest', async () => {
    const many = Array.from({ length: 45 }, (_, i) => issue(`SHOP-${i + 1}`, 'Backlog'))
    many.push(issue('SHOP-99', 'In Review'))
    stubJira({
      issues: many,
      changelog: {
        'SHOP-99': [
          { id: '1', created: daysAgo(2), author: { accountId: 'acct-other' }, items: [{ field: 'status', fromString: 'To Do', toString: 'In Review' }] },
        ],
      },
    })
    const report = await pullJira({ ...AUTH, jql: 'x', agingStatuses: ['In Review'] })
    const aged = report.groups.flatMap((group) => group.tickets).find((t) => t.key === 'SHOP-99')
    expect(aged.statusSince).not.toBeNull()
  })
})

describe('pullJira shape', () => {
  it('takes a chip tone from config, case-insensitively', async () => {
    stubJira({ issues: [issue('SHOP-1', 'Awaiting sign-off')] })
    const report = await pullJira({
      ...AUTH,
      jql: 'x',
      tones: { qcout: ['awaiting sign-off'] },
    })
    expect(report.groups[0].tickets[0].chip).toBe('qcout')
  })

  it('groups in the order the search returned, so the JQL decides what is read first', async () => {
    stubJira({
      issues: [
        issue('SHOP-1', 'In Review'),
        issue('SHOP-2', 'Backlog'),
        issue('SHOP-3', 'In Review'),
      ],
    })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.groups.map((group) => group.title)).toEqual(['In Review', 'Backlog'])
    expect(report.groups[0].tickets.map((t) => t.key)).toEqual(['SHOP-1', 'SHOP-3'])
  })

  it('never leaks the raw created date into the report', async () => {
    stubJira({ issues: [issue('SHOP-1', 'In Progress')] })
    const report = await pullJira({ ...AUTH, jql: 'x' })
    expect(report.groups[0].tickets[0].created).toBeUndefined()
  })

  it('refuses to run without credentials rather than reporting an empty board', async () => {
    await expect(pullJira({ site: SITE, jql: 'x' })).rejects.toThrow(/JIRA_EMAIL/)
    await expect(pullJira({ email: 'a', apiToken: 'b', jql: 'x' })).rejects.toThrow(/jiraSite/)
  })
})
