import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pullOpenPrs } from './github.mjs'

/*
 * These tests run the real code path — `gh` is spawned, its stdout is parsed — with a fake
 * `gh` first on PATH. Stubbing the module's own `graphql` would test nothing that has ever
 * broken here; what breaks is the parsing and the shaping of what GitHub actually returns.
 */
let dir
let realPath

const writeFake = (responses) => {
  // deploy-qc's own history: empty unless a test says otherwise, which is the same as a repo
  // whose QC branch has never carried a copy of anything.
  for (const [key, body] of Object.entries({ qcHistory: qcHistoryFor([]), ...responses })) {
    fs.writeFileSync(path.join(dir, `${key}.json`), body === 'fail' ? 'FAIL' : JSON.stringify(body))
  }
  // A shell script rather than node: this is spawned several times per test, and starting a
  // node process each time made the file the slowest in the suite by an order of magnitude.
  const script = `#!/bin/sh
case "$*" in
  *"auth token"*) echo fake-token; exit 0 ;;
esac
case "$*" in
  *"history(first"*) f=qcHistory ;;
  *"compare(headRef"*) f=qc ;;
  *) f=openPrs ;;
esac
if [ "$(cat "${dir}/$f.json")" = FAIL ]; then
  echo "gh: HTTP 502 upstream sulked" >&2
  exit 1
fi
cat "${dir}/$f.json"
`
  const file = path.join(dir, 'gh')
  fs.writeFileSync(file, script, { mode: 0o755 })
}

/** deploy-qc history as the QC pass reads it: one repo, newest first. */
const qcHistoryFor = (headlines, repos = 1) => ({
  data: Object.fromEntries(
    Array.from({ length: repos }, (_, i) => [
      `h${i}`,
      {
        ref: {
          target: {
            history: {
              nodes: headlines.map((messageHeadline, n) => ({
                oid: `qc${n}`,
                messageHeadline,
              })),
            },
          },
        },
      },
    ]),
  ),
})

/** A commit on the PR's own branch. Two parents means a merge of the base branch. */
const own = (oid, messageHeadline, parents = 1) => ({
  commit: {
    oid,
    messageHeadline,
    committedDate: '2026-05-14T08:00:00Z',
    pushedDate: null,
    parents: { totalCount: parents },
    author: { name: 'me', user: { login: 'me' } },
  },
})

const pr = (over = {}) => ({
  number: 1,
  title: 'SHOP-1 - cache the seller catalogue',
  url: 'https://github.com/example/orders-api/pull/1',
  isDraft: false,
  updatedAt: '2026-05-14T08:00:00Z',
  reviewDecision: 'APPROVED',
  headRefName: 'feature/shop-1',
  repository: { name: 'orders-api', isArchived: false },
  reviewThreads: { nodes: [] },
  reviews: { nodes: [] },
  commits: { totalCount: 0, nodes: [] },
  ...over,
})

const openPrs = (nodes, issueCount = nodes.length) => ({
  data: { search: { issueCount, nodes } },
})

const qcFor = (
  count,
  compare = { status: 'BEHIND', aheadBy: 0, behindBy: 7, commits: { nodes: [] } },
) => ({
  data: Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`p${i}`, { ref: { compare } }]),
  ),
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporto-gh-'))
  realPath = process.env.PATH
  process.env.PATH = `${dir}:${realPath}`
})

afterEach(() => {
  process.env.PATH = realPath
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const pull = (extra = {}) =>
  pullOpenPrs({
    author: 'me',
    org: 'example',
    jiraBrowseUrl: 'https://jira.example.com/browse',
    ...extra,
  })

describe('pullOpenPrs', () => {
  it('shapes a PR with its ticket, review state and deploy-qc containment', async () => {
    writeFake({ openPrs: openPrs([pr()]), qc: qcFor(1) })
    const report = await pull()
    const [one] = report.repos[0].prs
    expect(report.repos[0].repo).toBe('orders-api')
    expect(one.ticket).toBe('SHOP-1')
    expect(one.ticketUrl).toBe('https://jira.example.com/browse/SHOP-1')
    expect(one.review).toBe('APPROVED')
    expect(one.deployQc).toEqual({
      status: 'BEHIND',
      aheadBy: 0,
      behindBy: 7,
      aheadWork: 0,
      qcMatch: 'ancestor',
    })
  })

  /*
   * The commit deploy-qc was missing on a real PR was a merge of main left by Update branch,
   * so the card said "off QC · 1" about work that was on QC. Merges do not count as work.
   */
  it('separates the PR\'s work ahead of deploy-qc from its base-branch merges', async () => {
    writeFake({
      openPrs: openPrs([
        pr({
          commits: {
            totalCount: 3,
            nodes: [own('a', 'SHOP-1: the change'), own('m', 'Merge master', 2), own('b', 'SHOP-1: a fix')],
          },
        }),
      ]),
      qc: qcFor(1, {
        status: 'DIVERGED',
        aheadBy: 3,
        behindBy: 29,
        commits: { nodes: [{ oid: 'a' }, { oid: 'm' }, { oid: 'b' }] },
      }),
    })
    const [one] = (await pull()).repos[0].prs
    expect(one.deployQc).toEqual({ status: 'DIVERGED', aheadBy: 3, behindBy: 29, aheadWork: 2 })
  })

  /*
   * What made two deployed PRs read "off QC · 10" and "off QC · 5": a branch cut from an
   * up-to-date master carries every commit master gained since deploy-qc last moved, and none
   * of them are this PR's business.
   */
  it('ignores commits the branch carries from other people', async () => {
    writeFake({
      openPrs: openPrs([pr({ commits: { totalCount: 1, nodes: [own('a', 'SHOP-1: the change')] } })]),
      qc: qcFor(1, {
        status: 'DIVERGED',
        aheadBy: 9,
        behindBy: 413,
        // Eight of somebody else's commits, then this PR's one.
        commits: { nodes: [...Array.from({ length: 8 }, (_, i) => ({ oid: `x${i}` })), { oid: 'a' }] },
      }),
      qcHistory: qcHistoryFor(['SHOP-1: the change']),
    })
    const [one] = (await pull()).repos[0].prs
    expect(one.deployQc.aheadWork).toBe(0)
  })

  /*
   * deploy-qc is built by cherry-picking, so the same change lives there under a different id
   * and no comparison of ids will ever match it. Saying "off QC" there sends somebody to
   * deploy what is deployed — the way round that actually costs something.
   */
  it('reads a cherry-picked copy on deploy-qc as deployed, and says so', async () => {
    writeFake({
      openPrs: openPrs([
        pr({ commits: { totalCount: 2, nodes: [own('a', 'SHOP-1: the change'), own('b', 'SHOP-1: a fix')] } }),
      ]),
      qc: qcFor(1, {
        status: 'DIVERGED',
        aheadBy: 2,
        behindBy: 413,
        commits: { nodes: [{ oid: 'a' }, { oid: 'b' }] },
      }),
      qcHistory: qcHistoryFor(['SHOP-1: a fix', 'SHOP-1: the change']),
    })
    const [one] = (await pull()).repos[0].prs
    expect(one.deployQc.aheadWork).toBe(0)
    expect(one.deployQc.qcMatch).toBe('content')
  })

  /* A squash merge onto deploy-qc keeps no subject of the branch's own — only the number. */
  it('reads a squash of the PR onto deploy-qc as deployed', async () => {
    writeFake({
      openPrs: openPrs([pr({ commits: { totalCount: 1, nodes: [own('a', 'SHOP-1: the change')] } })]),
      qc: qcFor(1, {
        status: 'DIVERGED',
        aheadBy: 1,
        behindBy: 4,
        commits: { nodes: [{ oid: 'a' }] },
      }),
      qcHistory: qcHistoryFor(['SHOP-1 - cache the seller catalogue (#1)']),
    })
    expect((await pull()).repos[0].prs[0].deployQc.aheadWork).toBe(0)
  })

  /*
   * Absence has to be distinguishable from zero: a branch further ahead than the page can
   * show must not be reported as "no work ahead", which would read as deployed.
   */
  it('leaves the work count out when the page did not cover every commit ahead', async () => {
    writeFake({
      openPrs: openPrs([pr({ commits: { totalCount: 1, nodes: [own('a', 'SHOP-1: the change')] } })]),
      qc: qcFor(1, {
        status: 'AHEAD',
        aheadBy: 800,
        behindBy: 0,
        commits: { nodes: [{ oid: 'a' }, { oid: 'b' }] },
      }),
    })
    const [one] = (await pull()).repos[0].prs
    expect(one.deployQc.aheadWork).toBeUndefined()
    expect(one.deployQc.aheadBy).toBe(800)
  })

  /* The same rule for a PR whose own commit list was capped: unread, not "nothing missing". */
  it('leaves the work count out when the PR has more commits than were fetched', async () => {
    writeFake({
      openPrs: openPrs([pr({ commits: { totalCount: 40, nodes: [own('a', 'SHOP-1: the change')] } })]),
      qc: qcFor(1, {
        status: 'AHEAD',
        aheadBy: 1,
        behindBy: 0,
        commits: { nodes: [{ oid: 'a' }] },
      }),
    })
    expect((await pull()).repos[0].prs[0].deployQc.aheadWork).toBeUndefined()
  })

  /* An archived repo cannot be merged into, so an open PR there is history, not work. */
  it('drops PRs in archived repositories', async () => {
    writeFake({
      openPrs: openPrs([pr(), pr({ number: 2, repository: { name: 'old-thing', isArchived: true } })]),
      qc: qcFor(2),
    })
    const report = await pull()
    expect(report.repos.map((r) => r.repo)).toEqual(['orders-api'])
  })

  /*
   * A page cap is the failure that looks like good news: 100 of 140 fetched reads as "you
   * have 100 open PRs". GitHub sends the true total, so the report has to say when it is short.
   */
  it('says so when the search page was capped', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const many = Array.from({ length: 100 }, (_, i) => pr({ number: i + 1 }))
    writeFake({ openPrs: openPrs(many, 140), qc: qcFor(100) })
    const report = await pull()
    expect(report.incomplete).toEqual([
      'open PRs: fetched 100 of 140 — the rest is not in this report',
    ])
  })

  /* Absent, not an empty array: the field exists only when something is missing. */
  it('stays quiet when the page held everything', async () => {
    writeFake({ openPrs: openPrs([pr()], 1), qc: qcFor(1) })
    expect((await pull()).incomplete).toBeUndefined()
  })

  /* Comments without a verdict are not "no review"; the author is waiting on different things. */
  it('reads threads with no decision as COMMENTED', async () => {
    writeFake({
      openPrs: openPrs([
        pr({
          reviewDecision: null,
          reviewThreads: { nodes: [{ isResolved: false, isOutdated: false, latest: { nodes: [{ author: { login: 'them' } }] } }] },
        }),
      ]),
      qc: qcFor(1),
    })
    expect((await pull()).repos[0].prs[0].review).toBe('COMMENTED')
  })

  it('counts only the threads still waiting on me', async () => {
    const thread = (over) => ({
      isResolved: false,
      isOutdated: false,
      latest: { nodes: [{ author: { login: 'them' } }] },
      ...over,
    })
    writeFake({
      openPrs: openPrs([
        pr({
          reviewThreads: {
            nodes: [
              thread({}),
              thread({ isResolved: true }),
              thread({ isOutdated: true }),
              thread({ latest: { nodes: [{ author: { login: 'me' } }] } }),
            ],
          },
        }),
      ]),
      qc: qcFor(1),
    })
    expect((await pull()).repos[0].prs[0].unansweredThreads).toBe(1)
  })

  /*
   * The bug this pins: a merge of the base branch into the PR branch is not rework, and
   * counting it as one told the author a reviewer was waiting when nobody was.
   */
  it('does not read a base-branch merge as new work after a review', async () => {
    const commit = (committedDate, parents, login = 'me') => ({
      commit: {
        committedDate,
        pushedDate: committedDate,
        parents: { totalCount: parents },
        author: { name: login, user: { login } },
      },
    })
    writeFake({
      openPrs: openPrs([
        pr({
          reviews: { nodes: [{ submittedAt: '2026-05-14T09:00:00Z', author: { login: 'them' } }] },
          commits: { nodes: [commit('2026-05-14T10:00:00Z', 2)] },
        }),
      ]),
      qc: qcFor(1),
    })
    const [one] = (await pull()).repos[0].prs
    expect(one.lastReworkAt).toBeNull()
    expect(one.syncOnlySinceReview).toBe(true)
  })

  it('reports a real commit after the review as rework', async () => {
    const commit = {
      commit: {
        committedDate: '2026-05-14T10:00:00Z',
        pushedDate: '2026-05-14T10:00:00Z',
        parents: { totalCount: 1 },
        author: { name: 'me', user: { login: 'me' } },
      },
    }
    writeFake({
      openPrs: openPrs([
        pr({
          reviews: { nodes: [{ submittedAt: '2026-05-14T09:00:00Z', author: { login: 'them' } }] },
          commits: { nodes: [commit] },
        }),
      ]),
      qc: qcFor(1),
    })
    const [one] = (await pull()).repos[0].prs
    expect(one.lastReworkAt).toBe('2026-05-14T10:00:00Z')
    expect(one.syncOnlySinceReview).toBe(false)
  })

  /*
   * `compare` throws NOT_FOUND for a branch it cannot resolve, so one repo without deploy-qc
   * must degrade to "unknown" rather than costing the whole report.
   */
  it('survives a failed deploy-qc comparison with deployQc null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeFake({ openPrs: openPrs([pr()]), qc: 'fail' })
    const report = await pull()
    expect(report.repos[0].prs[0].deployQc).toBeNull()
  })

  it('puts pinned repositories first, in the order given', async () => {
    writeFake({
      openPrs: openPrs([
        pr({ number: 1, repository: { name: 'busy', isArchived: false } }),
        pr({ number: 2, repository: { name: 'busy', isArchived: false } }),
        pr({ number: 3, repository: { name: 'pinned', isArchived: false } }),
      ]),
      qc: qcFor(3),
    })
    const report = await pull({ pinnedRepos: ['pinned'] })
    expect(report.repos.map((r) => r.repo)).toEqual(['pinned', 'busy'])
  })

  it('leaves a PR with no ticket key honest about it', async () => {
    writeFake({ openPrs: openPrs([pr({ title: 'chore: bump the linter' })]), qc: qcFor(1) })
    const [one] = (await pull()).repos[0].prs
    expect(one.ticket).toBeNull()
    expect(one.ticketUrl).toBeNull()
  })

  it('surfaces the useful line of a failed gh call, not the query echo', async () => {
    writeFake({ openPrs: 'fail', qc: qcFor(0) })
    await expect(pull()).rejects.toThrow(/HTTP 502 upstream sulked/)
  })
})
