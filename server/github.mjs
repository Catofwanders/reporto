import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Bluedrop org repos are visible only to one account, so a `gh` keyring holding several
 * accounts will silently 404 if the wrong one is active. Pin the token explicitly.
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
  const { stdout } = await run('gh', ['api', 'graphql', '-f', `query=${query}`], {
    env: { ...process.env, GH_TOKEN: token },
    maxBuffer: 10 * 1024 * 1024,
  })
  const body = JSON.parse(stdout)
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '))
  return body.data
}

const OPEN_PRS = (author, org) => `
{
  search(query: "is:pr is:open author:${author} org:${org}", type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest {
        number title url isDraft updatedAt reviewDecision
        repository { name }
        reviewThreads(first: 100) { nodes { isResolved } }
      }
    }
  }
}`

const TICKET = /\b(DTP-\d+)\b/

/**
 * One GraphQL call for every open PR, instead of a search plus one `gh pr view` per PR.
 * reviewDecision is null when a PR has comments but no verdict — kept distinct from "no
 * review at all", because the two mean different things to the author.
 */
export async function pullOpenPrs({ author, org, jiraBrowseUrl, account }) {
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
    }
    const list = byRepo.get(n.repository.name) ?? []
    list.push(pr)
    byRepo.set(n.repository.name, list)
  }

  // Busiest repo first, freshest PR first — matches how the dashboard reads.
  const repos = [...byRepo.entries()]
    .map(([repo, prs]) => ({
      repo,
      prs: prs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .sort((a, b) => b.prs.length - a.prs.length || a.repo.localeCompare(b.repo))

  return {
    type: 'prs',
    date: new Date().toLocaleDateString('en-CA'),
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    author,
    repos,
  }
}
