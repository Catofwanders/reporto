import { afterEach, describe, expect, it, vi } from 'vitest'
import { pullSlack } from './slack.mjs'

const ME = 'U0ME'
const OTHER = 'U0THEM'

const ts = (secondsAgo) => String(Math.floor(Date.now() / 1000) - secondsAgo)

/**
 * A fake Slack, routed by method. Stubbing `fetch` keeps the form encoding, the `ok: false`
 * handling and the row assembly under test — which is where every bug in this puller has been.
 */
function stubSlack({ mentions = [], dms = [], replies = {}, history = {}, members } = {}) {
  const calls = []
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const method = String(url).split('/').pop()
    const params = new URLSearchParams(String(options.body ?? ''))
    calls.push({ method, params: Object.fromEntries(params) })
    const json = (body) =>
      new Response(JSON.stringify({ ok: true, ...body }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })

    switch (method) {
      case 'auth.test':
        return json({ user_id: ME, user: 'me' })
      case 'users.list':
        return json({
          members:
            members ?? [
              { id: ME, name: 'me', profile: {} },
              { id: OTHER, name: 'them', profile: {} },
              { id: 'U0BOT', name: 'buildbot', is_bot: true, profile: {} },
            ],
        })
      case 'search.messages': {
        const dm = params.get('query') === 'is:dm'
        const matches = dm ? dms : mentions
        return json({ messages: { matches, paging: { pages: 1 } } })
      }
      case 'conversations.replies': {
        const key = `${params.get('channel')}:${params.get('ts')}`
        return json({ messages: replies[key] ?? [{ ts: params.get('ts') }] })
      }
      case 'conversations.history': {
        const key = `${params.get('channel')}:${params.get('oldest')}`
        return json({ messages: history[key] ?? [] })
      }
      default:
        throw new Error(`unexpected slack method: ${method}`)
    }
  })
  return calls
}

const mention = (over = {}) => ({
  ts: ts(3600),
  user: OTHER,
  text: `<@${ME}> can you look at the basket totals?`,
  permalink: 'https://example.slack.com/archives/C1/p1',
  channel: { id: 'C1', name: 'orders-team' },
  ...over,
})

const pull = () => pullSlack({ token: 'xoxp-test', days: 14 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pullSlack rows', () => {
  it('shapes a channel mention with the text somebody actually wrote', async () => {
    stubSlack({ mentions: [mention()] })
    const report = await pull()
    expect(report.rows).toHaveLength(1)
    const [row] = report.rows
    expect(row.kind).toBe('mention')
    expect(row.channel).toBe('orders-team')
    // The row's display text has the markup flattened; the raw form is never shown.
    expect(row.excerpt).toBe('@someone can you look at the basket totals?')
    expect(row.lastMentionsMe).toBe(true)
  })

  /*
   * The fix this file exists for. The state readers had the last message all along and threw
   * the text away, so nothing downstream could tell "can you check this?" from "thanks!".
   */
  it('carries the last word of a thread, not only who wrote it', async () => {
    const at = ts(600)
    stubSlack({
      mentions: [mention({ ts: ts(3600) })],
      replies: {
        [`C1:${ts(3600)}`]: [
          { ts: ts(3600), user: OTHER, text: 'original' },
          { ts: at, user: OTHER, text: 'thanks, all sorted' },
        ],
      },
    })
    const [row] = (await pull()).rows
    expect(row.lastText).toBe('thanks, all sorted')
    expect(row.lastFromMe).toBe(false)
    expect(row.replies).toBe(1)
    expect(row.stateRead).toBe(true)
  })

  it('carries the last word from the channel when the answer was not threaded', async () => {
    const at = ts(3600)
    stubSlack({
      mentions: [mention({ ts: at })],
      history: {
        [`C1:${at}`]: [
          { ts: ts(300), user: OTHER, text: 'never mind, found it' },
          { ts: at, user: OTHER, text: 'original' },
        ],
      },
    })
    const [row] = (await pull()).rows
    expect(row.lastText).toBe('never mind, found it')
    expect(row.replies).toBe(1)
  })

  /*
   * The row offers a ✅ button. Without reading reactions the app creates rows it then refuses
   * to recognise as handled, and they come back as "waiting on you" until somebody speaks.
   */
  it('sees my own reaction on the mention', async () => {
    const at = ts(3600)
    stubSlack({
      mentions: [mention({ ts: at })],
      history: {
        [`C1:${at}`]: [{ ts: at, user: OTHER, text: 'original', reactions: [{ name: 'white_check_mark', users: [ME] }] }],
      },
    })
    const [row] = (await pull()).rows
    expect(row.iReacted).toBe(true)
  })

  it('does not mistake somebody else’s reaction for mine', async () => {
    const at = ts(3600)
    stubSlack({
      mentions: [mention({ ts: at })],
      history: {
        [`C1:${at}`]: [{ ts: at, user: OTHER, text: 'original', reactions: [{ name: 'eyes', users: ['U0THIRD'] }] }],
      },
    })
    expect((await pull()).rows[0].iReacted).toBe(false)
  })

  /* The channel read has to include the mention, or its reactions are invisible. */
  it('asks the channel inclusively, so the mention’s own reactions are in the page', async () => {
    const at = ts(3600)
    const calls = stubSlack({ mentions: [mention({ ts: at })], history: { [`C1:${at}`]: [] } })
    await pull()
    const history = calls.find((call) => call.method === 'conversations.history')
    expect(history.params.inclusive).toBe('true')
  })

  it('reads my own answer in the thread as answered', async () => {
    const at = ts(3600)
    stubSlack({
      mentions: [mention({ ts: at })],
      replies: {
        [`C1:${at}`]: [
          { ts: at, user: OTHER, text: 'original' },
          { ts: ts(120), user: ME, text: 'on it' },
        ],
      },
    })
    expect((await pull()).rows[0].lastFromMe).toBe(true)
  })

  it('skips my own mentions of myself, and channels the config excludes', async () => {
    stubSlack({
      mentions: [
        mention({ user: ME }),
        mention({ channel: { id: 'C9', name: 'announcements' }, ts: ts(1800) }),
      ],
    })
    const report = await pullSlack({ token: 'x', days: 14, excludeChannels: ['#announcements'] })
    expect(report.rows).toEqual([])
  })

  it('marks app messages as bots', async () => {
    stubSlack({ mentions: [mention({ user: 'U0BOT' })] })
    expect((await pull()).rows[0].bot).toBe(true)
  })

  it('takes a DM’s newest message as its last word, with no extra call', async () => {
    const calls = stubSlack({
      dms: [
        {
          ts: ts(900),
          user: OTHER,
          text: 'the client moved the call',
          channel: { id: 'D1', is_im: true, user: OTHER },
          permalink: 'https://example.slack.com/archives/D1/p1',
        },
      ],
    })
    const [row] = (await pull()).rows
    expect(row.kind).toBe('dm')
    expect(row.lastText).toBe('the client moved the call')
    expect(row.stateRead).toBe(true)
    expect(calls.some((call) => call.method === 'conversations.replies')).toBe(false)
  })

  it('refuses to run without a token rather than reporting an empty Slack', async () => {
    await expect(pullSlack({})).rejects.toThrow(/SLACK_USER_TOKEN/)
  })
})
