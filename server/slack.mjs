/**
 * Slack, as a triage queue rather than a chat client.
 *
 * The question this answers is the same one the review queue answers about GitHub: what is
 * waiting on me. Slack's own answer — unread badges — is useless for that, because unread
 * clears the moment a channel is glanced at on a phone, and a message somebody is waiting on
 * a reply to reads as handled. So "waiting" here is derived from the conversation itself:
 * somebody addressed me, and the last word in that thread is not mine.
 *
 * Auth is a *user* token (xoxp), so everything it reads is what the human can already read
 * and anything it posts is their own message. Loopback-only, single-user server; a token in
 * .env is the honest trade, the same one the Jira puller makes.
 */

const API = 'https://slack.com/api'

/** How far back a mention is still worth answering. Older than this is archaeology. */
const DEFAULT_DAYS = 14

/** Replies are read per thread, so the newest mentions are the ones worth the calls. */
const THREAD_LOOKUPS = 40

const isoOf = (ts) => new Date(Number(String(ts).split('.')[0]) * 1000).toISOString()

/**
 * One API call, form-encoded (Slack ignores JSON bodies on most endpoints).
 *
 * 429 is not an error here but an instruction: Slack says how long to wait, and the search
 * tier allows so few calls per minute that a pull without this would fail halfway and write
 * a partial report.
 */
async function call(token, method, params = {}, attempt = 0) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: new URLSearchParams(params),
  })

  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('retry-after') ?? 2)
    await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000))
    return call(token, method, params, attempt + 1)
  }

  const body = await res.json()
  if (!body.ok) {
    // Slack's own words are more useful than a paraphrase: "not_allowed_token_type" and
    // "missing_scope" each say exactly which step of the setup is wrong.
    const needed = body.needed ? ` (needs ${body.needed})` : ''
    throw new Error(`slack ${method}: ${body.error}${needed}`)
  }
  return body
}

/** Slack ids look like U04AB123 (people) or B01… (apps); never a name worth showing. */
const idLike = (value) => /^[UWB][A-Z0-9]{6,}$/.test(String(value ?? ''))

/** Display name, falling back through the fields Slack actually fills. */
const nameOf = (user) =>
  user?.profile?.display_name || user?.profile?.real_name || user?.name || user?.id || 'unknown'

/**
 * Every human in the workspace, once, so rows can say names without a call per message.
 * One paginated list is cheaper than N lookups and the result is small enough to keep.
 */
async function userIndex(token) {
  const names = new Map()
  const bots = new Set()
  let cursor
  do {
    const body = await call(token, 'users.list', { limit: '500', ...(cursor ? { cursor } : {}) })
    for (const user of body.members ?? []) {
      names.set(user.id, nameOf(user))
      if (user.is_bot || user.id === 'USLACKBOT') bots.add(user.id)
    }
    cursor = body.response_metadata?.next_cursor || undefined
  } while (cursor)
  return { names, bots }
}

/**
 * Mentions of me, newest first, from Slack's search rather than by walking channels.
 *
 * Search is the whole reason this is cheap: one call covers every channel I am in, including
 * the ones I would never think to poll. It is a paid-plan feature — a free workspace answers
 * `not_allowed_token_type`, and that error is left to surface rather than silently degrading
 * into a partial answer that looks complete.
 */
async function mentionsOf(token, handle, days) {
  const rows = []
  const cutoff = Date.now() - days * 86_400_000
  let page = 1
  for (;;) {
    const body = await call(token, 'search.messages', {
      query: `@${handle}`,
      sort: 'timestamp',
      sort_dir: 'desc',
      count: '100',
      page: String(page),
    })
    const matches = body.messages?.matches ?? []
    for (const match of matches) {
      if (new Date(isoOf(match.ts)).getTime() < cutoff) return rows
      rows.push(match)
    }
    const paging = body.messages?.paging
    if (!paging || page >= paging.pages || matches.length === 0) return rows
    page += 1
  }
}

/**
 * The last word in the thread this message belongs to, or null when it is not in one.
 *
 * `conversations.replies` accepts any message in a thread, not only the parent, which is the
 * only reason this works: search results do not carry `thread_ts`, so whether a mention is
 * threaded at all is not knowable until asked. A single message comes back as a thread of
 * one, and that is the signal for "ask the channel instead".
 */
async function threadState(token, channel, ts, meId) {
  const body = await call(token, 'conversations.replies', { channel, ts, limit: '200' })
  const messages = body.messages ?? []
  if (messages.length <= 1) return null
  const last = messages[messages.length - 1]
  return {
    replies: messages.length - 1,
    lastUser: last?.user ?? last?.bot_id ?? null,
    lastAt: last?.ts ? isoOf(last.ts) : null,
    // Somebody else may have spoken last while my answer sits above it: still not on me.
    mineSince: messages.some((message) => message.ts !== ts && message.user === meId),
    threaded: true,
  }
}

/**
 * Direct messages, newest first, from search rather than by walking conversations.
 *
 * There are far more DM conversations than channels — a `conversations.history` call each
 * would be minutes of rate-limited requests for an answer that search gives in one call.
 * Only the newest message per conversation matters: it is either mine or somebody's waiting.
 */
async function dmsOf(token, days) {
  const newest = new Map()
  const cutoff = Date.now() - days * 86_400_000
  let page = 1
  for (;;) {
    const body = await call(token, 'search.messages', {
      query: 'is:dm',
      sort: 'timestamp',
      sort_dir: 'desc',
      count: '100',
      page: String(page),
    })
    const matches = body.messages?.matches ?? []
    for (const match of matches) {
      if (new Date(isoOf(match.ts)).getTime() < cutoff) return [...newest.values()]
      const id = match.channel?.id
      // Descending order means the first sighting of a conversation is its last word.
      if (id && !newest.has(id)) newest.set(id, match)
    }
    const paging = body.messages?.paging
    if (!paging || page >= paging.pages || matches.length === 0) return [...newest.values()]
    page += 1
  }
}

/**
 * Did anything land in the channel after this mention, and was it mine?
 *
 * Half of Slack's replies are not thread replies — somebody @s me in a channel and I answer
 * in the channel. `conversations.replies` cannot see that, so without this every such
 * exchange stayed in "waiting on me" forever, which is exactly the false alarm this report
 * exists to avoid.
 */
async function channelStateSince(token, channel, ts, meId) {
  const body = await call(token, 'conversations.history', {
    channel,
    oldest: ts,
    inclusive: 'false',
    limit: '50',
  })
  const after = (body.messages ?? []).filter((message) => message.ts !== ts)
  // history returns newest first, so the first entry is the last word in the channel.
  const last = after[0]
  return {
    replies: after.length,
    lastUser: last?.user ?? last?.bot_id ?? null,
    lastAt: last?.ts ? isoOf(last.ts) : null,
    mineSince: after.some((message) => message.user === meId),
  }
}

/** github.com/<org>/<repo>/pull/<n>, however it was pasted or auto-linked. */
const PR_LINK = /github\.com\/[^/\s]+\/([A-Za-z0-9._-]+)\/pull\/(\d+)/g

/**
 * What a message is *about*, so the flow checks can cross it with Jira and GitHub: the ticket
 * keys and pull requests named in it. Read from the full text rather than the excerpt, which
 * is cut at 160 characters and would drop the reference half the time.
 */
function referencesIn(text, ticketKey) {
  const body = String(text ?? '')
  const tickets = ticketKey ? [...new Set(body.match(ticketKey) ?? [])] : []
  const prs = []
  for (const [, repo, num] of body.matchAll(PR_LINK)) {
    const ref = `${repo}#${Number(num)}`
    if (!prs.includes(ref)) prs.push(ref)
  }
  return { tickets, prs }
}

/** First line, trimmed: enough to recognise the message without reproducing the thread. */
function excerptOf(text) {
  const flat = String(text ?? '')
    // <@U123> and <#C123|name> are Slack's own markup; a row reading "<@U04AB>" says nothing.
    .replace(/<@([A-Z0-9]+)(\|[^>]*)?>/g, '@someone')
    .replace(/<#([A-Z0-9]+)\|([^>]*)>/g, '#$2')
    .replace(/<(https?:[^|>]+)\|([^>]*)>/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat
}

/** The longest message this dashboard will send. Slack's own limit is 40k; this is a reply. */
const MAX_REPLY = 3000

/**
 * Posts a reply as me.
 *
 * A user token makes this indistinguishable from typing in Slack: same author, same channel,
 * no undo. So the caller has to name a conversation that is already in the report — the
 * dashboard can answer where I was addressed and nowhere else. That check happens in the
 * plugin, which is the only thing holding the report; here the job is to send exactly what
 * was asked and to say what came back.
 */
export async function postSlackReply({ token, channel, threadTs, text }) {
  // The message is checked before the credentials: "empty message" is the useful answer to
  // an empty message, whatever the token situation is.
  const message = String(text ?? '').trim()
  if (!message) throw new Error('empty message')
  if (message.length > MAX_REPLY) throw new Error(`message is over ${MAX_REPLY} characters`)
  if (!token) throw new Error('set SLACK_USER_TOKEN in .env (a user token, xoxp-)')

  const body = await call(token, 'chat.postMessage', {
    channel,
    text: message,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    // Link previews are the sender's noise, not the reader's: a reply about a PR should not
    // paste the whole PR card underneath it.
    unfurl_links: 'false',
    unfurl_media: 'false',
  })
  return { channel: body.channel, ts: body.ts }
}

/**
 * A channel id from whatever the config names: an id passes through, a name is looked up.
 *
 * The destination for the stand-up cannot come from the browser — a note posted to the wrong
 * channel is not something an undo fixes — so it comes from config/reporto.json, and this is
 * where a human-written "#standup" becomes something the API accepts.
 */
export async function resolveChannel(token, nameOrId) {
  if (!token) throw new Error('set SLACK_USER_TOKEN in .env (a user token, xoxp-)')
  const wanted = String(nameOrId ?? '').trim().replace(/^#/, '')
  if (!wanted) throw new Error('no channel configured')
  if (/^[CG][A-Z0-9]{6,}$/.test(wanted)) return wanted

  let cursor
  do {
    const body = await call(token, 'conversations.list', {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '1000',
      ...(cursor ? { cursor } : {}),
    })
    const found = (body.channels ?? []).find((channel) => channel.name === wanted)
    // Not being a member is the interesting failure: the name resolves, the post would not.
    if (found) {
      if (!found.is_member) throw new Error(`you are not in #${wanted}`)
      return found.id
    }
    cursor = body.response_metadata?.next_cursor || undefined
  } while (cursor)
  throw new Error(`no channel called #${wanted}`)
}

/** A reaction as a one-word answer, for the messages that do not need a sentence. */
export async function addSlackReaction({ token, channel, ts, name = 'white_check_mark' }) {
  if (!token) throw new Error('set SLACK_USER_TOKEN in .env (a user token, xoxp-)')
  if (!/^[a-z0-9_+-]{1,40}$/.test(name)) throw new Error('that is not an emoji name')
  await call(token, 'reactions.add', { channel, timestamp: ts, name })
  return { channel, ts, name }
}

export async function pullSlack({
  token,
  days = DEFAULT_DAYS,
  excludeChannels = [],
  ticketPattern,
}) {
  if (!token) throw new Error('set SLACK_USER_TOKEN in .env (a user token, xoxp-)')

  const me = await call(token, 'auth.test')
  const { names, bots } = await userIndex(token)
  const handle = names.get(me.user_id) ?? me.user
  // Search matches the @handle, which is the login rather than the display name.
  const matches = await mentionsOf(token, me.user, days)

  const skip = new Set(excludeChannels.map((name) => name.replace(/^#/, '').toLowerCase()))
  // Global, because a message can name several tickets and match.match needs the g flag.
  const ticketKey = ticketPattern ? new RegExp(ticketPattern, 'g') : null
  const rows = []
  let lookups = 0

  for (const match of matches) {
    const channelName = match.channel?.name ?? ''
    if (skip.has(channelName.toLowerCase())) continue
    // My own messages come back for the same query when I have typed my own handle.
    if (match.user === me.user_id) continue

    const threadTs = match.thread_ts ?? null
    const row = {
      kind: 'mention',
      id: `${match.channel?.id}:${match.ts}`,
      channel: channelName || (match.channel?.is_im ? 'DM' : match.channel?.id ?? 'unknown'),
      channelId: match.channel?.id ?? '',
      permalink: match.permalink ?? '',
      from: names.get(match.user) ?? match.username ?? 'unknown',
      fromId: match.user ?? '',
      bot: bots.has(match.user) || Boolean(match.bot_id),
      at: isoOf(match.ts),
      threadTs,
      excerpt: excerptOf(match.text),
      ...referencesIn(match.text, ticketKey),
      replies: 0,
      lastFrom: names.get(match.user) ?? match.username ?? 'unknown',
      lastFromMe: false,
      lastAt: isoOf(match.ts),
    }

    /*
     * Reading what came after costs a call per mention, so only the newest ones get it; the
     * rest keep the mention itself as the last word, which is what an unanswered mention is
     * anyway. A threaded mention asks the thread; a bare one asks the channel, because a
     * reply to it is an ordinary channel message and no thread exists to read.
     */
    if (lookups < THREAD_LOOKUPS && match.channel?.id) {
      try {
        // Thread first, channel second: a mention answered inside its thread and one
        // answered in the channel below it are both answered, and only one of the two
        // endpoints can see each case.
        const state =
          (await threadState(token, match.channel.id, match.ts, me.user_id)) ??
          (await channelStateSince(token, match.channel.id, match.ts, me.user_id))
        lookups += 1
        row.threadTs = state.threaded ? match.ts : null
        row.replies = state.replies
        if (state.lastUser) {
          row.lastFrom = names.get(state.lastUser) ?? 'unknown'
          row.lastFromMe = state.lastUser === me.user_id
        }
        // In a busy channel somebody else usually has the last word, but if I have spoken
        // since the mention then it is not waiting on me either.
        if (state.mineSince) row.lastFromMe = true
        row.lastAt = state.lastAt ?? row.lastAt
      } catch {
        // A channel I have since left, or a deleted message: the mention still stands on its
        // own, so keep the row rather than dropping it.
      }
    }
    rows.push(row)
  }

  /*
   * DMs need no thread or channel lookup: a direct message conversation has one timeline, so
   * its newest message *is* the last word, and who wrote it is the whole answer.
   */
  for (const match of await dmsOf(token, days)) {
    /*
     * For a DM, search fills `channel.name` with the counterpart's *user id*, which reads as
     * "@U884KPRL7" in a row. The id is the thing to resolve, not to display: try the
     * conversation's user, then the id in the name, then whoever wrote the message if it was
     * not me — one of those is a person.
     */
    const other =
      names.get(match.channel?.user) ??
      (idLike(match.channel?.name) ? names.get(match.channel.name) : match.channel?.name) ??
      (match.user !== me.user_id ? names.get(match.user) : null) ??
      'unknown'
    rows.push({
      kind: 'dm',
      id: `${match.channel?.id}:${match.ts}`,
      channel: other,
      channelId: match.channel?.id ?? '',
      permalink: match.permalink ?? '',
      from: names.get(match.user) ?? match.username ?? other,
      fromId: match.user ?? '',
      bot: bots.has(match.user) || Boolean(match.bot_id),
      at: isoOf(match.ts),
      threadTs: null,
      excerpt: excerptOf(match.text),
      ...referencesIn(match.text, ticketKey),
      replies: 0,
      lastFrom: names.get(match.user) ?? match.username ?? other,
      lastFromMe: match.user === me.user_id,
      lastAt: isoOf(match.ts),
    })
  }

  rows.sort((a, b) => new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime())

  return {
    type: 'slack',
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    me: handle,
    days,
    rows,
  }
}
