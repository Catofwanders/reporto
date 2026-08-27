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

## 2. Change a PR's status

**Built.** Each PR row has a menu: mark ready for review / convert to draft, and close with
a confirmation naming the repo, number and title. `POST /api/pr/<repo>/<num>/<action>`
drives it — draft and ready are GraphQL mutations (REST cannot flip draft state), close and
reopen a REST PATCH. The action comes from a fixed server-side list, so the request can only
name one of four; **merge is deliberately not among them.** Unanswered inline comments show
in the row's reason line.

Still open from the original sketch: requesting reviewers, and whether closed PRs should
linger in the list so the action is undoable in place.


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
people, and GitHub does not allow approving your own PR. Merging is deliberately out of scope
here: only the human merges, ever — see `.claude/rules/git-operations.md`.

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

## 3. Summary widget in "My open PRs", with copy-unapproved-links button

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

## 4. Per-PR "Resolve comments" — PR detail page with a live Claude terminal

For a PR that has unanswered review comments, one click opens a dedicated page showing
the full PR context and, under it, a large terminal already running `claude` in that
repo's local checkout — so the review feedback can be worked through without leaving the
dashboard or hunting for the directory.

**Shape**

- The button appears on a PR row only when that PR has **unanswered** review comments —
  nobody replied, nothing pushed over the hunk — and says how many. Resolution state is not
  the test: nobody here clicks resolve.
- It navigates to a detail route, `/pr/:repo/:number`, which shows:
  - PR title, state, review verdict, branch, ticket link;
  - each unanswered thread — file, line, author, body, and the surrounding diff hunk —
    since that is the actual work list;
  - threads already answered or pushed over, collapsed, for context.
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

## 5. Pull Jira and GitHub data from APIs instead of driving an agent

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

Note the account trap: org repos may be visible to only one of the accounts in the `gh`
keyring, and the wrong one 404s silently. If the
active `gh` account is another one, every call against the org returns `HTTP 404`. Either
pin the account per call (`gh --hostname`/`GH_TOKEN` from the right keyring entry) or check
`gh auth status` first and fail with a clear message rather than reporting an empty PR list.

Replaces the whole `prs` report plus the deploy-branch ancestry check. GraphQL is required
for `pullRequest.reviewThreads { isResolved }` — REST cannot express resolution state,
which is exactly what request 4 needs.

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
title, and unanswered inline comment count — writes `prs-<date>.json` and bumps the index.
Measured 1.5s against 11 PRs, versus roughly three minutes for the `/jira` agent run. The
PRs card picks it automatically (bolt icon) and no longer marks the Jira card busy.

Two things learned while building it:
- The thread count covers *inline* threads only. A review left as a top-level body — as on
  #987 — has zero threads, so request 4's button cannot key off this number alone.
- Resolution state turned out to be useless here: nobody on this team clicks resolve, so
  the count only ever grew. What the reports carry instead is "nobody replied and nobody
  pushed over the hunk" — see `unansweredThreads` in `server/github.mjs`.
- The API result can be fresher than the skill's: #1791 merged at 06:45 UTC and vanished
  from the open list within the same session.

Still to do here: the `jira` puller, which needs the Atlassian token. The report also wants
the deploy-branch ancestry check, which is GitHub-side and can reuse the same token.

## 6. Command palette (⌘K) — **built**

Shipped: ⌘K over tickets, PRs, pages, update actions and the kit listing, with scored
matching, hash-deep-links that scroll to and flash the row, and copy-the-invocation for
commands. Left undone from the sketch below: the `>`-for-actions-only mode.


Jump anywhere by typing: a ticket key, a PR number, a repo, a command from `/commands`, or
a report to refresh. Today every one of those is a click path through the sidebar, and the
app has no search at all — the top bar deliberately has no search box because a box that
searched nothing would be set dressing. A palette is the version that can actually answer.

**Shape**

- ⌘K anywhere opens it; Esc closes; ↑↓ and Enter drive it without the mouse.
- Sources, in priority order: tickets from the Jira report (key and summary), PRs from the
  PR report (number, title, repo), pages, refresh actions, and the entries `/api/kit`
  already returns.
- Selecting a ticket or PR opens it on the board or in the lane it lives in, not in a new
  tab — the dashboard should be able to answer without leaving.

**Mechanics**

Everything needed is already loaded client-side: `reports.jira`, `reports.prs`, and
`/api/kit`. No new endpoint. Matching wants to be fuzzy enough that a bare number finds
the ticket that carries it and an abbreviation finds a long repo name; a small scored
substring match is probably enough before reaching for a library.

**Open questions**

- Does selecting a *command* copy the invocation or do something more? The app cannot run
  a slash command — that happens in a Claude session — so copy is the honest action.
- Whether ⌘K should also accept `>` for actions only, the way editors do. Probably later.

## 7. Ticket detail drawer

Click a board card and read the ticket in place: description, comments, the PRs on it, and
the transitions the workflow allows. Today the board shows key, summary, PR chips and
status, and anything more means a round trip to Jira in the browser.

**Shape**

- A drawer over the board rather than a route, so the board stays behind it and Esc returns
  to exactly where you were.
- Description and the last few comments, rendered from Jira's ADF (the REST API returns
  Atlassian Document Format, not markdown — that conversion is the bulk of the work).
- The PRs on the ticket with their review state, reusing the lane logic already in
  `prLanes.ts` rather than a second rendering of PR state.
- The status control that is already on the card, so a transition can be made from the
  drawer.

**Mechanics**

`GET /api/jira/<KEY>` in the shape of the existing transition endpoints, returning the
fields the drawer needs. Comments are a second call (`/comment`) and are worth a limit — the
last five, newest first. ADF → React needs a small renderer for the node types that actually
appear: paragraph, text with marks, lists, code blocks, links, and `mediaSingle` (which
should degrade to a link rather than trying to fetch an attachment).

**Open questions**

- Whether to allow commenting from the drawer. That is a write to a shared board with no
  undo, so it wants the same confirmation the PR close action got.
- Attachments and images: probably a link out, since the drawer has no auth to fetch them.

## 8. Ticket aging digest — **built**

The board cards carry a pill once a ticket is past the limit for its status, red past twice
it; the stand-up note lists the overdue ones under blockers. Limits are per status in
`config/reporto.json` (`statusAging`), which is also what decides which statuses cost a
changelog read — six on this machine's board, about 20 seconds of pull.

Two things settled while building it. `statuscategorychangedate` looked like a free answer but
is useless here: In Progress → CODE REVIEW → QC READY are all one category, so it never moves
for the transitions that matter. And days are derived at render rather than stored, because a
report read the next morning would otherwise still claim "2 days".

The original sketch follows.

## 8. Ticket aging digest (original sketch)

The PR lanes now say "no review yet — 6 days, chase it". Tickets have no equivalent: a
ticket can sit in CODE REVIEW for a week and the board looks the same on day one and day
seven.

**Shape**

- Per ticket: how long it has been in its current status, and a nudge when that exceeds what
  is normal for that status.
- Surfaced where it is actionable — the aging pill on a board card, and a line in the
  stand-up note's blockers.

**Mechanics**

Time-in-status needs the changelog, which is one request per ticket — the same cost the
cycle-time median already pays in `server/stats.mjs`. Two options, and the choice matters:

- Pull the changelog for the tickets on the board at refresh time and store `statusSince`
  per ticket in the Jira report. Costs ~25 requests per refresh, and makes the report shape
  carry it, so every view gets it for free.
- Derive it from the day snapshots already on disk. Free, but the snapshots have gaps
  (weekends, days the puller did not run), so "7 days in CODE REVIEW" would be a guess. The
  statistics page already refuses to do this for exactly this reason.

The first is the honest one. What has to be settled first is the threshold per status —
"normal" for CODE REVIEW is not "normal" for QC READY, and a fixed number of days would cry
wolf on the statuses that are meant to be slow.

## 9. Live updates instead of polling — **researched, and the polling half built**

**What the research found.** Push is not available to this app for four of the five sources,
and the reason is the same each time: a webhook needs a public URL, and this server is
loopback-only by design (see the security model). GitHub and Jira webhooks are out for that
reason; Google Calendar's push needs a verified HTTPS callback domain, which is the same wall.

Slack is the exception — **Socket Mode** delivers events over an outbound WebSocket with no
public URL, using an app-level `xapp-` token. It is the one real push option here, and it is
*not* free: Socket Mode delivers what Event Subscriptions are subscribed to, and message
events want a bot user with its own scopes. The app as installed has user scopes only and no
bot user, so turning this on means editing the Slack app (bot user, `channels:history` and
friends on the bot token, `socket_mode_enabled: true`, an app-level token) and holding a
WebSocket open in the dev server — which keeps state between requests, something nothing here
does today. Worth doing for Slack alone only if the mention queue starts feeling late.

**What was built instead**, because it covers every source and needs no external setup: the
trigger is attention rather than time. On load, on navigation, and when the window regains
focus, the reports *the current route shows* are refetched if they are past their own
freshness ceiling — 5 minutes for Slack, 10 for PRs and reviews, 30 for the board, 2 hours for
the calendar, a day for statistics. Nothing runs on a timer, nothing is fetched for a page
nobody is on, kinds run one at a time, and a per-kind minimum gap survives a window that flaps
focus. See `src/freshness.ts` and `src/components/LiveRefresh.tsx`.

Still open from this item: conditional requests. A GitHub REST `304` costs no rate-limit
budget, which would make a short interval cheap — but the PR and review pullers are GraphQL,
which has no equivalent, so it would mean rewriting them against REST to save a budget nothing
is currently short of.

## 9b. Live updates — the original sketch

Every report is a file on disk that changes only when something pulls it, so the app shows
whatever the last pull found. Today that means the auto-refresh in `src/autoRefresh.ts`
(anything older than `STALE_HOURS` is refetched once per session) plus whatever buttons get
pressed. The question is whether any of it can be push rather than poll.

**What to check per source, because they differ**

- **Slack** — the only one with real push available to a local app: Socket Mode over a
  WebSocket, using an app-level `xapp-` token, delivers `message` and `reaction_added` events
  with no public endpoint. That is the strongest candidate, and the reason the app-level token
  already exists.
- **GitHub** — webhooks need a public URL. A local dev server has none, so either a tunnel
  (another moving part, and it exposes a port) or the GraphQL polling that already works. Also
  worth measuring: conditional requests. A `304` costs no rate-limit budget on REST, which
  makes a short poll interval cheap; GraphQL has no equivalent.
- **Jira** — webhooks are admin-configured and also want a public URL. Assume polling.
- **Google Calendar** — push notifications require an HTTPS callback with a verified domain.
  Assume polling; `updatedMin` plus a sync token keeps the request small.

**If push is not available (the likely answer for three of four)**

Make the polling reasoned rather than fixed:

- Poll on `visibilitychange` and window focus, not on a timer while the tab sits hidden — the
  data only matters when somebody is looking at it.
- Per-kind intervals from how fast each source actually moves: PR review state changes in
  minutes, the calendar in hours, monthly statistics in days.
- Only refetch the report the current page shows, with the dashboard refetching the four its
  modules read.
- Show freshness rather than hiding it: the nav already stamps each row, and a "just now"
  after a focus-triggered pull is what tells the reader the number in front of them is live.

**What has to be settled first**

Whether a WebSocket connection held by the dev server is acceptable at all — it means the
server keeps state between requests, which nothing here does today, and a dropped socket has
to reconnect without turning into a busy loop. Also whether Socket Mode events are worth it
for Slack alone, or whether one honest poll on focus covers every source with a fraction of
the machinery.
