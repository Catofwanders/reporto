# Feature requests

Ideas not yet built. Each entry states what it should do, how it would likely work, and
what has to be settled first.

## 1. Change a Jira ticket's status from the dashboard

Move a ticket between statuses (for example `CODE REVIEW` → `QC READY`) without leaving
the dashboard. Today the Jira card is read-only; every transition means opening the
ticket in a browser.

**Shape**

- A status control on each row of the active-ticket list, offering only the transitions
  Jira actually allows for that ticket.
- The allowed transitions come from Jira, not a hardcoded list — statuses and workflows
  differ per project and change over time.
- After a successful transition, refresh only that ticket rather than re-running the
  whole report.

**Mechanics**

The Atlassian MCP already exposes what is needed: `getTransitionsForJiraIssue` to list
the legal moves and `transitionJiraIssue` to apply one. Both are read/write against a
live board, so this cannot be a static-page feature: it needs a dev-server endpoint in
the same shape as `/api/refresh`, with the cross-site guard applied.

**Open questions**

- Is a single transition enough, or does the workflow need a comment or field update at
  the same time (some transitions require fields)?
- What happens when a transition fails validation — surface Jira's message inline on the
  row, presumably.
- Optimistic update or wait for Jira to confirm? Given how slow the round trip is,
  optimistic with rollback (the pattern already used for mail todos) is probably right.

## 2. Merge a selected PR into `deploy-qc`

Put an approved PR's branch onto `deploy-qc` so it lands in the QC environment, chosen
from the open-PR list.

**Shape**

- A per-PR action in the open-PR list, enabled only for PRs that are approved and not
  already in `deploy-qc` — the dashboard already computes both facts.
- After the merge, re-check ancestry so the row immediately reflects the new state.

**Mechanics**

Merging a branch into `deploy-qc` is not the same as merging a PR to `master`, and the
distinction matters:

- `deploy-qc` is periodically hard-reset to `origin/master` and amended, which drops
  QC-only merges. Anything this feature puts there is expected to disappear on the next
  reset — that is normal, and it is exactly why the dashboard checks ancestry instead of
  trusting a PR's merged flag.
- The reset procedure treats console merges to `master` as forbidden. This feature must
  never touch `master`; it targets `deploy-qc` only.

**Constraints before building this**

- **Never automated.** The merge must be triggered by an explicit human click, one PR at
  a time, with the target branch and the PR shown in a confirmation step. No batch
  action, no "merge everything approved", and no agent deciding to run it.
- The confirmation has to name what is being merged where, because the failure mode
  (merging the wrong branch, or into the wrong target) is not silently reversible.
- Decide the merge method — a real merge commit onto `deploy-qc` keeps history honest
  about what QC contains, whereas a squash makes ancestry checks harder to read.

**Open questions**

- Who owns conflicts? If the merge conflicts, the dashboard should refuse and hand the
  user a local command rather than attempting a resolution.
- Should the action be available at all for repos without a `deploy-qc` branch? Those
  exist, and the report already knows which ones.

## 3. Change a PR's status

Act on my own pull requests from the open-PR list instead of opening each one on GitHub.
The list already shows review state and the draft flag, so the state is visible but not
editable.

**Shape**

Only the states the PR's author actually controls:

- Mark a draft ready for review, and convert a PR back to draft.
- Close a PR, and reopen a closed one. The stalest entries in the list are long-dead
  drafts, which is the main thing this would clear out.
- Request reviewers, if that turns out to be the step most often missing after a PR goes
  ready.

Review verdicts stay out of scope: approving or requesting changes belongs to other
people, and GitHub does not allow approving your own PR. Merging is deliberately not
here either — that is request 2, with its own constraints.

**Mechanics**

`gh pr ready`, `gh pr ready --undo`, `gh pr close`, `gh pr reopen`, and
`gh pr edit --add-reviewer` cover all of it, so this reuses the same dev-server endpoint
pattern as the other write actions, behind the cross-site guard. The `gh` allow-list in
`vite.config.ts` currently permits only `gh search prs`, `gh pr view`, and the compare
API, so each new subcommand has to be added there explicitly.

**Constraints**

- Closing a PR is the one action here that discards work in progress, so it needs an
  explicit confirmation naming the repo and PR — and it should stay a single-PR action,
  never a sweep over everything idle.
- Ready-for-review and draft toggles are cheap and reversible; those can act immediately
  with an optimistic row update.

**Open questions**

- After marking ready, should the dashboard also refresh the review state, given the PR
  may immediately pick up required reviewers?
- Is a reviewer picker worth the complexity, or is a link to GitHub enough for that one
  case?
- Should closed PRs stay visible in the list for the rest of the day (so the action is
  undoable in place) or vanish on the next refresh?

## 4. Summary widget in "My open PRs", with copy-unapproved-links button

**Built.** The strip sits above the repo accordions: counts for awaiting review / approved /
changes requested / drafts, and a button copying the links of PRs awaiting *someone else's*
review — drafts and changes-requested excluded, since neither is waiting on a reviewer.

One thing worth remembering: `navigator.clipboard.writeText` can hang forever — never
resolving, never rejecting — when the window is not frontmost, even with permission granted
in a secure context. `src/copyText.ts` races it against a 1.2s timeout, falls back to the
synchronous selection trick, and only then shows the links in a textarea to select by hand.
A bare `await` on the clipboard API leaves the button dead with no error.


A small summary block at the top of the open-PR section, whose main action copies the
links of every PR that is **not** approved yet to the clipboard — ready to paste into a
chat when chasing reviews.

**Shape**

- Sits inside the open-PR panel, above the per-repo accordions, so it summarises exactly
  what is listed below it.
- Counts worth showing: total open, approved and waiting to merge, awaiting review,
  changes requested, and drafts. The data is already in the report; this is derivation,
  not a new fetch.
- One button: **Copy links awaiting review**. Copies the URLs of PRs whose review state
  is not `APPROVED`, one per line, and confirms how many were copied.

**Mechanics**

Purely client-side: `navigator.clipboard.writeText`, no server round trip and no new
permission. The report already carries `review` and `url` per PR, so the filter is a one
-liner over `report.repos.flatMap(r => r.prs)`.

**Decisions to make**

- Should drafts be included? A draft cannot be reviewed, so chasing it is noise — lean
  toward excluding drafts and saying so on the button ("awaiting review, excluding
  drafts").
- Do `CHANGES_REQUESTED` PRs belong in the copy? Those are waiting on *me*, not on a
  reviewer, so probably not — that argues for the filter being "awaiting someone else's
  review" rather than the literal "not approved".
- Plain URLs, or `repo#123 — title — url` per line? Plain URLs paste cleanly into Slack
  and auto-unfurl; the richer form is easier to read in a comment. Possibly two buttons,
  or a modifier-click for the verbose form.
- Clipboard access needs a user gesture and a secure context. `localhost` counts as
  secure, so this works in dev, but the fallback (select-and-copy from a textarea) is
  worth having if the write is rejected.

## 5. Per-PR "Resolve comments" — PR detail page with a live Claude terminal

For a PR that has unresolved review comments, one click opens a dedicated page showing
the full PR context and, under it, a large terminal already running `claude` in that
repo's local checkout — so the review feedback can be worked through without leaving the
dashboard or hunting for the directory.

**Shape**

- The button appears on a PR row only when that PR has **unresolved** review threads, and
  says how many.
- It navigates to a detail route, `/pr/:repo/:number`, which shows:
  - PR title, state, review verdict, branch, ticket link;
  - each unresolved thread — file, line, author, body, and the surrounding diff hunk —
    since that is the actual work list;
  - resolved threads collapsed, for context.
- Below that, a terminal filling most of the viewport, attached to a `claude` session
  whose working directory is that repo's checkout, seeded with the PR number and the
  thread list so the first turn already has the context.

**Mechanics**

Three pieces this repo does not have yet:

1. **Unresolved-thread data.** REST does not expose resolution state; the GraphQL API
   does, via `pullRequest.reviewThreads { isResolved, comments { path, line, body } }`.
   So `gh api graphql -f query=…`, which means a new entry in the `gh` allow-list.
2. **Repo → local path mapping.** The dashboard knows repo names, not where they live on
   disk. Add a `repoPaths` map to `config/reporto.json` (gitignored, so the paths stay
   personal), and treat a missing entry as "button disabled, with a reason".
3. **A terminal over the wire.** `node-pty` on the dev server, `xterm.js` in the page,
   and a WebSocket between them. `node-pty` is a native module, so it needs a prebuild
   or a compiler — weigh that before committing to it.

**Security — read before building**

This is the most dangerous feature in this file. A browser-reachable PTY is arbitrary
command execution as the user, and the existing cross-site guard **does not cover it**:

- WebSocket handshakes are not subject to CORS and cannot be blocked by a custom header,
  so the server must check the `Origin` header on the upgrade request itself and reject
  anything that is not this dev server, plus require a single-use token minted by the
  page over HTTP.
- Bind to loopback only (already the case) and refuse a second attach to the same session
  so a stray tab cannot type into a live shell.
- The terminal must be interactive, not `-p`: permission prompts belong on screen where
  the human answers them. Do not pass a broad `--allowedTools` list to make it quiet.
- Merging stays forbidden regardless of what is typed in that terminal — see
  `.claude/rules/git-operations.md`.

**Open questions**

- "Resolve comments" is two different things: *fixing the code* (the agent's job) and
  *marking the threads resolved on GitHub* (a `resolveReviewThread` mutation). Probably
  the button means the first, with an explicit per-thread "mark resolved" action after
  the fix lands — never resolving threads automatically.
- What if the checkout is on another branch, or dirty? The page should show branch and
  working-tree state up front and let the human decide; the agent must not switch
  branches or stash on its own.
- One session per PR, or a single shared terminal? Per PR is clearer but multiplies
  processes; either way sessions need an idle timeout and a visible kill button.
- Should scrollback survive a page reload, and if so, where does it live? A buffer in the
  dev server is simplest; nothing should be written to `db/`.
- Is a terminal even the right surface, versus a plain "open this repo in a new Claude
  Code session" that hands off to the real terminal? The handoff is far less work and
  carries none of the PTY risk — worth prototyping first to see whether the embedded
  version earns its complexity.

## 6. Pull Jira and GitHub data from APIs instead of driving an agent

Mail and calendar stay as they are — read by the `/email` skill in an interactive session,
which needs the Chrome extension and is not worth replacing. This request covers only the
two sources that can be fetched directly, which are also the two that refresh most often.

### Where the credentials come from

Nothing in a file, nothing in git, nothing pasted into a chat. Each secret goes into the
macOS Keychain, typed by the human once:

```bash
security add-generic-password -s reporto-jira -a you@example.com -w   # prompts for the token
security find-generic-password -s reporto-jira -w                     # how the server reads it
```

### GitHub — no new credential needed

`gh auth token` already returns a working token on this machine (scopes `repo`,
`read:org`, `admin:public_key`, `gist`), and `gh api graphql` authenticates fine. Shell out
to `gh api`, 5000 requests/hour.

Note the account trap: Bluedrop org repos are visible only to **BaturaBluedrop**. If the
active `gh` account is another one, every call against the org returns `HTTP 404`. Either
pin the account per call (`gh --hostname`/`GH_TOKEN` from the right keyring entry) or check
`gh auth status` first and fail with a clear message rather than reporting an empty PR list.

Replaces the whole `prs` report plus the deploy-branch ancestry check. GraphQL is required
for `pullRequest.reviewThreads { isResolved }` — REST cannot express resolution state,
which is exactly what request 5 needs.

### Jira — one self-service API token

Create at `id.atlassian.com/manage-profile/security/api-tokens`, no admin involved;
authenticate with Basic (email + token) against `/rest/api/3/…`. Confirmed the REST host
answers (401 unauthenticated). Covers JQL search, issue detail, comments, and — for
request 1 — `/transitions` to read and apply status changes.

### Shape in the app

- `POST /api/pull/<kind>` beside the existing `/api/refresh/<kind>`, same cross-site guard,
  returning the same report JSON the skills write — so `types.ts` stays the contract and
  the UI changes only in which endpoint the button calls.
- Keep the skill path as a per-kind fallback chosen by config
  (`source: "api" | "skill"`), so a broken token degrades to something slow that works
  rather than a dead card.
- These fetches are fast enough to be synchronous: for `jira` and `prs` the command lock,
  the 15-minute watchdog and the 409-join logic all stop being necessary.

### Order of work

GitHub first — no new secret, and it covers the most-used report. Jira second, one token.
Nothing else moves.

### Status

**GitHub `prs` is done.** `POST /api/pull/prs` (see `server/github.mjs`) fetches every open
PR in one GraphQL call — review decision, draft flag, updated time, ticket key from the
title, and unresolved inline thread count — writes `prs-<date>.json` and bumps the index.
Measured 1.5s against 11 PRs, versus roughly three minutes for the `/jira` agent run. The
PRs card picks it automatically (bolt icon) and no longer marks the Jira card busy.

Two things learned while building it:
- `unresolvedThreads` counts *inline* threads only. A review left as a top-level body — as
  on #987 — has zero threads, so request 5's button cannot key off this number alone.
- The API result can be fresher than the skill's: #1791 merged at 06:45 UTC and vanished
  from the open list within the same session.

Still to do here: the `jira` puller, which needs the Atlassian token. The report also wants
the deploy-branch ancestry check, which is GitHub-side and can reuse the same token.
