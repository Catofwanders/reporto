import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Org repos are often visible to only one of the accounts a `gh` keyring holds, and the
 * wrong active account silently 404s rather than saying so. Pin the token explicitly.
 */
async function ghToken(account) {
  if (account) {
    try {
      const { stdout } = await run('gh', ['auth', 'token', '--user', account])
      return stdout.trim()
    } catch {
      throw new Error(`no gh token for "${account}" — run: gh auth login --user ${account}`)
    }
  }
  const { stdout } = await run('gh', ['auth', 'token'])
  return stdout.trim()
}

async function graphql(query, token) {
  let stdout
  try {
    ;({ stdout } = await run('gh', ['api', 'graphql', '-f', `query=${query}`], {
      env: { ...process.env, GH_TOKEN: token },
      maxBuffer: 10 * 1024 * 1024,
    }))
  } catch (err) {
    // gh echoes the whole query back on failure; surface only what went wrong.
    throw new Error(ghMessage(err))
  }
  const body = JSON.parse(stdout)
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '))
  return body.data
}

/** The useful line of a failed `gh` call, without the query echo. */
function ghMessage(err) {
  const text = String(err?.stderr || err?.message || err)
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .find((l) => l.startsWith('gh:') || /^(HTTP|error|GraphQL)/i.test(l))
  return (line ?? text.split('\n').pop() ?? 'gh call failed').replace(/^gh:\s*/, '')
}

const OPEN_PRS = (author, org) => `
{
  search(query: "is:pr is:open author:${author} org:${org}", type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest {
        number title url isDraft updatedAt reviewDecision headRefName
        repository { name }
        reviewThreads(first: 100) { nodes { isResolved } }
        reviews(last: 20) { nodes { submittedAt author { login } } }
        commits(last: 1) { nodes { commit { committedDate pushedDate } } }
      }
    }
  }
}`

const TICKET = /\b(DTP-\d+)\b/

/**
 * When the last review landed, ignoring the author's own review comments — a self-comment
 * is not somebody else's verdict, and treating it as one would flip every PR to reviewed.
 */
function lastReviewAt(reviews, author) {
  const dates = reviews
    .filter((r) => r?.submittedAt && r.author?.login !== author)
    .map((r) => r.submittedAt)
    .sort()
  return dates.at(-1) ?? null
}

/**
 * When the tip commit arrived. pushedDate is the honest "when did the reviewer see it",
 * but GitHub returns null for it on most commits, so committedDate is the fallback.
 */
function lastCommitAt(commits) {
  const commit = commits.at(-1)?.commit
  return commit?.pushedDate ?? commit?.committedDate ?? null
}

const QC_BRANCH = 'deploy-qc'

/**
 * One aliased field per PR, so the whole fleet's QC state costs a single call. A repo
 * without the branch resolves `ref` to null, and a deleted head branch makes `compare`
 * null — both mean "nothing to say", not "not deployed".
 */
const QC_COMPARE = (org, prs) => `
{
${prs
  .map(
    ({ repo, headRefName }, i) => `  p${i}: repository(owner: "${org}", name: "${repo}") {
    ref(qualifiedName: "refs/heads/${QC_BRANCH}") {
      compare(headRef: "${headRefName}") { status aheadBy behindBy }
    }
  }`,
  )
  .join('\n')}
}`

/**
 * Whether each PR's head is contained in deploy-qc. The comparison runs base=deploy-qc to
 * head, so `aheadBy` counts commits the QC branch has not got yet: zero means the branch
 * is deployed there (BEHIND — QC has moved on since — or IDENTICAL).
 *
 * `compare` throws NOT_FOUND for a branch it cannot resolve rather than returning null, so
 * a failure here degrades to "unknown" for the whole batch instead of losing the report.
 */
async function pullQcState(org, prs, token) {
  const targets = prs.filter((pr) => pr.headRefName)
  if (!targets.length) return new Map()
  let data
  try {
    data = await graphql(QC_COMPARE(org, targets), token)
  } catch (err) {
    console.warn(`[reporto] deploy-qc comparison skipped: ${String(err.message ?? err)}`)
    return new Map()
  }
  const byKey = new Map()
  targets.forEach((pr, i) => {
    const compare = data[`p${i}`]?.ref?.compare
    if (!compare) return
    byKey.set(`${pr.repo}#${pr.num}`, {
      status: compare.status,
      aheadBy: compare.aheadBy,
      behindBy: compare.behindBy,
    })
  })
  return byKey
}

/**
 * One GraphQL call for every open PR, instead of a search plus one `gh pr view` per PR.
 * reviewDecision is null when a PR has comments but no verdict — kept distinct from "no
 * review at all", because the two mean different things to the author.
 */
export async function pullOpenPrs({ author, org, jiraBrowseUrl, account, pinnedRepos = [] }) {
  const token = await ghToken(account ?? author)
  const data = await graphql(OPEN_PRS(author, org), token)
  const nodes = data.search.nodes.filter((n) => n && n.number)

  const byRepo = new Map()
  for (const n of nodes) {
    const ticket = TICKET.exec(n.title)?.[1] ?? null
    const threads = n.reviewThreads?.nodes ?? []
    const pr = {
      num: n.number,
      title: n.title,
      url: n.url,
      ticket,
      ticketUrl: ticket ? `${jiraBrowseUrl}/${ticket}` : null,
      review: n.reviewDecision ?? (threads.length ? 'COMMENTED' : 'NONE'),
      draft: n.isDraft,
      updatedAt: n.updatedAt,
      unresolvedThreads: threads.filter((t) => !t.isResolved).length,
      lastReviewAt: lastReviewAt(n.reviews?.nodes ?? [], author),
      lastCommitAt: lastCommitAt(n.commits?.nodes ?? []),
    }
    const list = byRepo.get(n.repository.name) ?? []
    list.push(pr)
    byRepo.set(n.repository.name, list)
  }

  const qc = await pullQcState(
    org,
    nodes.map((n) => ({
      repo: n.repository.name,
      num: n.number,
      headRefName: n.headRefName,
    })),
    token,
  )
  for (const [repo, prs] of byRepo) {
    for (const pr of prs) pr.deployQc = qc.get(`${repo}#${pr.num}`) ?? null
  }

  // Pinned repos first in the order given, then busiest repo, then freshest PR — matches
  // how the dashboard reads. A pin keeps a repo visible even when it holds a single PR.
  const pinRank = (repo) => {
    const at = pinnedRepos.indexOf(repo)
    return at === -1 ? pinnedRepos.length : at
  }
  const repos = [...byRepo.entries()]
    .map(([repo, prs]) => ({
      repo,
      prs: prs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .sort(
      (a, b) =>
        pinRank(a.repo) - pinRank(b.repo) ||
        b.prs.length - a.prs.length ||
        a.repo.localeCompare(b.repo),
    )

  return {
    type: 'prs',
    date: new Date().toLocaleDateString('en-CA'),
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    author,
    repos,
  }
}

const TICKET_PRS = (author, org) => `
{
  search(query: "is:pr author:${author} org:${org} sort:updated-desc", type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest {
        number title url state isDraft reviewDecision
        repository { name }
        mergeCommit { oid }
      }
    }
  }
}`

/** deploy-qc containment for merged commits, one aliased comparison per PR. */
const MERGED_IN_QC = (org, prs) => `
{
${prs
  .map(
    ({ repo, oid }, i) => `  m${i}: repository(owner: "${org}", name: "${repo}") {
    ref(qualifiedName: "refs/heads/${QC_BRANCH}") {
      compare(headRef: "${oid}") { aheadBy }
    }
  }`,
  )
  .join('\n')}
}`

/** Merge commits for PRs found without one — the fallback search cannot return them. */
const MERGE_OIDS = (org, prs) => `
{
${prs
  .map(
    ({ repo, num }, i) => `  o${i}: repository(owner: "${org}", name: "${repo}") {
    pullRequest(number: ${num}) { mergeCommit { oid } }
  }`,
  )
  .join('\n')}
}`

/** How many per-ticket fallback searches one pull may spend (search API: 30/min). */
const FALLBACK_LIMIT = 15

/**
 * Ticket key → the PRs implementing it, for the Jira report. Matching is by key in the PR
 * title, which is the convention the branches follow; a PR that omits its key simply does
 * not get attached rather than being guessed at.
 *
 * Closed and merged PRs matter here (a ticket's history is the point), unlike the open-PR
 * report, so this searches every state and leans on sort:updated-desc for the cap.
 */
export async function pullTicketPrs({
  author,
  org,
  ticketPattern,
  account,
  fallbackKeys = [],
}) {
  const token = await ghToken(account ?? author)
  const data = await graphql(TICKET_PRS(author, org), token)
  const nodes = (data.search.nodes ?? []).filter((n) => n && n.number)
  const byTicket = new Map()
  const merged = []
  for (const n of nodes) {
    const key = new RegExp(ticketPattern, 'i').exec(n.title)?.[0]?.toUpperCase()
    if (!key) continue
    const list = byTicket.get(key) ?? []
    const pr = {
      repo: n.repository.name,
      num: n.number,
      url: n.url,
      state: n.state.toLowerCase(),
      // Review state only means something while the PR is open; a closed PR that happened
      // to be a draft should read as closed, not "draft".
      note:
        n.state !== 'OPEN'
          ? undefined
          : n.isDraft
            ? 'draft'
            : n.reviewDecision === 'APPROVED'
              ? 'approved'
              : n.reviewDecision === 'CHANGES_REQUESTED'
                ? 'changes requested'
                : undefined,
    }
    if (pr.state === 'merged' && n.mergeCommit?.oid) {
      merged.push({ pr, repo: pr.repo, oid: n.mergeCommit.oid })
    }
    list.push(pr)
    byTicket.set(key, list)
  }

  const extra = await addFallbackMatches({
    org,
    author,
    ticketPattern,
    token,
    byTicket,
    fallbackKeys,
  })
  await markMergedQc(org, [...merged, ...extra], token)
  return byTicket
}

/**
 * Whether each merged commit is still reachable from deploy-qc. This is the check a QC
 * branch reset breaks silently: the PR stays merged, its work stops being on QC. `aheadBy
 * 0` means still there; a repo without the branch or an unresolvable commit leaves `inQc`
 * null rather than claiming it went missing.
 */
async function markMergedQc(org, merged, token) {
  if (!merged.length) return
  const needOid = merged.filter((m) => !m.oid)
  if (needOid.length) {
    try {
      const oids = await graphql(MERGE_OIDS(org, needOid), token)
      needOid.forEach((m, i) => {
        m.oid = oids[`o${i}`]?.pullRequest?.mergeCommit?.oid
      })
    } catch (err) {
      console.warn(`[reporto] merge-commit lookup failed: ${String(err.message ?? err)}`)
    }
  }
  merged = merged.filter((m) => m.oid)
  if (!merged.length) return
  let data
  try {
    data = await graphql(MERGED_IN_QC(org, merged), token)
  } catch (err) {
    console.warn(`[reporto] merged deploy-qc check skipped: ${String(err.message ?? err)}`)
    return
  }
  merged.forEach(({ pr }, i) => {
    const compare = data[`m${i}`]?.ref?.compare
    pr.inQc = compare ? compare.aheadBy === 0 : null
  })
}

/**
 * Tickets whose PRs never named them in the title. One search each, title and body, for
 * the keys the caller says are worth it — capped, because the search API allows 30 calls a
 * minute and a backlog of unmatched tickets would burn straight through that.
 */
async function addFallbackMatches({
  org,
  author,
  ticketPattern,
  token,
  byTicket,
  fallbackKeys,
}) {
  const found = []
  const missing = fallbackKeys.filter((key) => !byTicket.has(key))
  const budget = missing.slice(0, FALLBACK_LIMIT)
  if (missing.length > budget.length) {
    console.warn(
      `[reporto] ${missing.length - budget.length} ticket(s) left unmatched: fallback search capped at ${FALLBACK_LIMIT}`,
    )
  }
  for (const key of budget) {
    let found
    try {
      const { stdout } = await run(
        'gh',
        [
          'search',
          'prs',
          key,
          '--owner',
          org,
          // Body mentions are noisy — a review bot quoting the key would otherwise attach
          // its own PR to the ticket. Only my PRs can implement my ticket.
          '--author',
          author,
          '--limit',
          '5',
          '--json',
          'number,title,state,repository,url,isDraft',
        ],
        { env: { ...process.env, GH_TOKEN: token }, maxBuffer: 2 * 1024 * 1024 },
      )
      found = JSON.parse(stdout)
    } catch (err) {
      console.warn(`[reporto] fallback search for ${key} failed: ${ghMessage(err)}`)
      continue
    }
    const prs = (found ?? [])
      // A hit whose title names a *different* ticket belongs to that one, not this one.
      .filter((n) => {
        const titled = new RegExp(ticketPattern, 'i').exec(n.title)?.[0]?.toUpperCase()
        return !titled || titled === key
      })
      .map((n) => ({
        repo: n.repository?.name ?? n.repository?.nameWithOwner?.split('/').pop() ?? '',
        num: n.number,
        url: n.url,
        state: String(n.state).toLowerCase(),
        note: 'matched by body',
      }))
    if (!prs.length) continue
    byTicket.set(key, prs)
    for (const pr of prs) {
      if (pr.state === 'merged') found.push({ pr, repo: pr.repo, num: pr.num })
    }
  }
  return found
}

const PR_NODE_ID = (owner, repo, num) => `
{
  repository(owner: "${owner}", name: "${repo}") {
    pullRequest(number: ${num}) { id isDraft state title }
  }
}`

const READY = (id) => `
mutation { markPullRequestReadyForReview(input: {pullRequestId: "${id}"}) {
  pullRequest { number isDraft } } }`

const DRAFT = (id) => `
mutation { convertPullRequestToDraft(input: {pullRequestId: "${id}"}) {
  pullRequest { number isDraft } } }`

export const PR_ACTIONS = ['ready', 'draft', 'close', 'reopen']

/**
 * Applies one state change to one pull request.
 *
 * Draft and ready are GraphQL mutations (REST cannot flip draft state); close and reopen
 * are a REST PATCH. Every call resolves the node id first, which also validates that the
 * PR exists and is visible to the pinned account — a wrong account 404s here rather than
 * silently doing nothing.
 */
export async function prAction({ owner, repo, num, action, account }) {
  if (!PR_ACTIONS.includes(action)) throw new Error(`unknown action "${action}"`)
  const token = await ghToken(account)

  const info = await graphql(PR_NODE_ID(owner, repo, num), token)
  const pr = info.repository?.pullRequest
  if (!pr) throw new Error(`${repo}#${num} not found for this account`)

  if (action === 'ready' || action === 'draft') {
    if (action === 'ready' && !pr.isDraft) return { repo, num, changed: false, isDraft: false }
    if (action === 'draft' && pr.isDraft) return { repo, num, changed: false, isDraft: true }
    const data = await graphql(action === 'ready' ? READY(pr.id) : DRAFT(pr.id), token)
    const out = data.markPullRequestReadyForReview ?? data.convertPullRequestToDraft
    return { repo, num, changed: true, isDraft: out.pullRequest.isDraft }
  }

  const state = action === 'close' ? 'closed' : 'open'
  try {
    await run(
    'gh',
    [
      'api',
      '--method',
      'PATCH',
      `repos/${owner}/${repo}/pulls/${num}`,
      '-f',
      `state=${state}`,
      '--silent',
    ],
      { env: { ...process.env, GH_TOKEN: token } },
    )
  } catch (err) {
    throw new Error(ghMessage(err))
  }
  return { repo, num, changed: true, state }
}

/**
 * One month of PR activity for a month range, as four search counts plus the merged PRs
 * themselves — the nodes are what the medians and the per-repo split are computed from.
 *
 * `reviewed-by` is dated by `updated`, not by when the review was submitted: GitHub's
 * search has no "reviewed during" qualifier, so that one count is "PRs I reviewed that
 * moved this month" rather than "reviews I left this month". Close enough to read as
 * review load, and the only thing the search API can answer.
 */
export async function pullPrStats({ author, org, account, from, to }) {
  const token = await ghToken(account)
  const scope = `org:${org} author:${author}`
  const range = `${from}..${to}`
  const data = await graphql(
    `query {
      merged: search(query: "is:pr ${scope} merged:${range}", type: ISSUE, first: 100) {
        issueCount
        nodes {
          ... on PullRequest {
            number
            createdAt
            mergedAt
            repository { name }
            reviews(first: 20) { nodes { submittedAt author { login } } }
          }
        }
      }
      opened: search(query: "is:pr ${scope} created:${range}", type: ISSUE, first: 1) { issueCount }
      abandoned: search(query: "is:pr ${scope} is:unmerged closed:${range}", type: ISSUE, first: 1) {
        issueCount
      }
      reviewed: search(query: "is:pr org:${org} reviewed-by:${author} -author:${author} updated:${range}", type: ISSUE, first: 1) {
        issueCount
      }
    }`,
    token,
  )

  const merged = (data.merged?.nodes ?? []).filter((pr) => pr && pr.mergedAt)
  const byRepo = new Map()
  for (const pr of merged) {
    const repo = pr.repository?.name ?? 'unknown'
    byRepo.set(repo, (byRepo.get(repo) ?? 0) + 1)
  }

  const hours = (from, to) => (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000

  return {
    merged: data.merged?.issueCount ?? 0,
    opened: data.opened?.issueCount ?? 0,
    abandoned: data.abandoned?.issueCount ?? 0,
    reviewsGiven: data.reviewed?.issueCount ?? 0,
    byRepo: [...byRepo.entries()]
      .map(([repo, count]) => ({ repo, merged: count }))
      .sort((a, b) => b.merged - a.merged),
    // Only reviews by somebody else count as "reviewed": self-reviews and the author's own
    // review comments would otherwise report a turnaround nobody waited for.
    hoursToFirstReview: merged
      .map((pr) => {
        const first = (pr.reviews?.nodes ?? [])
          .filter((r) => r?.submittedAt && r.author?.login !== author)
          .map((r) => r.submittedAt)
          .sort()[0]
        return first ? hours(pr.createdAt, first) : null
      })
      .filter((v) => v !== null),
    hoursToMerge: merged.map((pr) => hours(pr.createdAt, pr.mergedAt)),
  }
}

/**
 * PRs of mine merged since a date, newest first. Search rather than per-repo listing: the
 * merged ones are gone from the open-PR report, and "which repos did I touch" is not known
 * in advance.
 */
export async function pullMergedSince({ author, org, account, since }) {
  const token = await ghToken(account)
  const data = await graphql(
    `query {
      search(query: "is:pr author:${author} org:${org} merged:>=${since}", type: ISSUE, first: 50) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            mergedAt
            repository { name }
          }
        }
      }
    }`,
    token,
  )
  return (data.search?.nodes ?? [])
    .filter((pr) => pr && pr.mergedAt)
    .map((pr) => ({
      repo: pr.repository?.name ?? 'unknown',
      num: pr.number,
      title: pr.title,
      url: pr.url,
      mergedAt: pr.mergedAt,
    }))
    .sort((a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime())
}
