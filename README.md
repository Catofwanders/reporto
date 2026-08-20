# reporto

A personal dashboard for daily work triage: mail, calendar, Jira tickets, and my open
pull requests, each rendered from a JSON report on disk.

**This is a single-user, local-only app by design.** See
[Why it stays local](#why-it-stays-local) before considering deploying it anywhere.

## Running it

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Use `npm run dev`, not `npm run preview`. The write and refresh APIs live in a Vite
dev-server plugin (`vite.config.ts`), so a production build is a static site with no
API: no refresh buttons that work, no todo persistence.

## How data gets in

Reports are JSON files in `public/reports/`, listed by `index.json`:

| File | Written by | Contents |
|---|---|---|
| `email-<date>.json` | `/email` skill | actionable mail from both inboxes |
| `calendar-<date>.json` | `/email` skill | today's events, upcoming watch-list |
| `jira-<date>.json` | server, Jira REST API | tickets, their PRs, and merged-PR QC state |
| `prs-<date>.json` | server, GitHub GraphQL | my open PRs grouped by repo |

The TypeScript types in `src/types.ts` are the schema of record, guarded on load by
`src/reportSchema.ts`.

Jira and PRs need no agent: the server calls the APIs itself, so those two cards work on a
fresh clone as soon as credentials exist. Mail and calendar cannot work that way — they are
read through the Chrome extension, which attaches only to an interactive Claude Code
session — so they come from a skill. A sanitized copy lives in [`skills/`](skills/) with
placeholders where the accounts go, alongside the contract any producer must meet.
Output is JSON only; the dashboard is the renderer.

`db/<date>.json` is a per-day snapshot of the reports plus todo state (checked,
deleted, checkedAt) so work can be tracked over time. It is written through the API,
never by hand.

**Neither `public/reports/` nor `db/` is committed** — both are gitignored. They hold
mail subjects, meeting join links (some with embedded passwords), and ticket detail,
which has no business in a git remote. A fresh checkout therefore starts with no data:
the cards stay hidden and the action bar reads "never" until you press an update
button.

## Committing

This repository belongs to the `Catofwanders` account and **only that identity commits
here** — set repo-locally, overriding whatever global git identity is configured for other
projects:

```bash
git config user.name  "Catofwanders"
git config user.email "23452775+Catofwanders@users.noreply.github.com"
```

## Configuration

```bash
cp -r config.template config     # then edit config/reporto.json
cp .env.example .env             # then add your Jira API token
```

The Jira pull authenticates with a personal API token
([create one](https://id.atlassian.com/manage-profile/security/api-tokens)) read from
`JIRA_EMAIL` and `JIRA_API_TOKEN`; `.env` is gitignored and lifted into the environment by
`vite.config.ts`. Without them the Jira card's button returns
`no Jira credentials` and changes nothing. The GitHub side uses your `gh` keyring auth,
pinned to the account in `githubAccount`.

`config/` is gitignored and holds anything specific to you — the GitHub org to query, the
repos pinned to the top of the PR list, and which slash command produces which reports. Details in
[`config.template/README.md`](config.template/README.md). Without it the committed
template is used as a fallback.

## What the PR list shows

Each row carries one split pill: review state on the left, deploy-qc state on the right,
each in its own colour.

GitHub's `reviewDecision` collapses "nobody has looked yet" and "somebody commented and I
have pushed since" into states that read identically in a list, so `src/prState.ts` derives
the difference instead:

| State | Meaning |
|---|---|
| `awaiting review` | nobody but me has reviewed — waiting on a reviewer |
| `commented` | reviewed, no commit since — waiting on me |
| `awaiting re-review` | reviewed, and I pushed after that — waiting on a reviewer again |
| `approved` / `changes requested` | GitHub's own verdicts, kept as they are |

`commented` counts as waiting on me, so it is excluded from the "awaiting review" count and
from the copy-links nudge button.

The right half answers "is this branch on `deploy-qc`?" from one aliased ref comparison per
PR (base `deploy-qc` → head): `aheadBy: 0` means deployed, so both `BEHIND` (QC has moved
on since) and `IDENTICAL` read as **on QC**. Otherwise it shows **off QC · N**, N being the
commits QC has not got. No chip renders at all when there is nothing to claim — a repo
without the branch, a deleted head branch, or a failed comparison — rather than implying a
PR is off QC.

Jira sits below as compact cards, as many per row as the width allows, summaries clamped to
two lines. A card whose **merged** PR is no longer reachable from `deploy-qc` gets a red
chip naming it: a QC branch reset drops merged work silently — the PR still reads as merged
and the ticket still reads as done — so that is the one state worth shouting about.

PRs attach to tickets by key in the PR title. For statuses in `fallbackStatuses` a ticket
with no title match also gets one body search of your own PRs, capped at 15 searches per
pull to stay clear of the search API's 30/minute limit; anything skipped is logged rather
than silently dropped.

## Update buttons

Jira and PRs can be refreshed from the dashboard. Mail and calendar cannot, and carry no
button at all — those cards only show how old their data is.

| Report | How it refreshes |
|---|---|
| `prs` | `POST /api/pull/prs` — one GitHub GraphQL call, about a second (bolt icon) |
| `jira` | `POST /api/pull/jira` — one Jira search plus one GitHub search (bolt icon) |
| `email`, `calendar` | run `/email` in your own Claude Code session |

Both pulls are plain API calls, so they answer in about a second and cost no tokens. The
agent-spawning path (`POST /api/refresh/<kind>`, `claude -p`) still exists for any command
you list under `commandGroups`, but nothing needs it out of the box.

Mail and calendar read both inboxes through the Chrome extension, and that extension
attaches only to an interactive session you started — a spawned `claude -p` run has no
`mcp__claude-in-chrome__*` tools at all and aborts having read nothing. So there is nothing
for a button to do. Run the skill yourself; when you switch back to the browser tab the
dashboard reloads and picks up the files it wrote.

A spawned run counts as successful only if it actually rewrote a report file: a skill that
cannot do its job may still exit 0 after explaining why, so exit status alone would report
a success that changed nothing.

Only one run per command at a time; a second request during a run waits for it and then
loads its output. Runs get SIGTERM at 15 minutes and SIGKILL ten seconds later, and the
request always answers even if the child never dies, so the lock cannot wedge.

## PR actions

Each row in "My open PRs" has a menu — mark ready for review, convert to draft, or close.
`POST /api/pr/<repo>/<num>/<action>` applies it with the same pinned GitHub token as the
puller, behind the same cross-site guard. The action must be one of four the server knows;
**merging is not one of them and never will be.** Closing asks for confirmation first,
naming the repo, number and title, since it is the only one that discards work.

## Security model

The dev server can write files and start agent processes, so it is not a passive
static server:

- Bound to `127.0.0.1` only — never reachable from the LAN.
- Every state-changing request to `/api/db` and `/api/refresh` must have an `Origin`
  matching the server's host **and** an `X-Reporto-Write: 1` header. A cross-origin
  "simple" POST from any page you happen to have open can set neither, which is what
  stops a drive-by request from triggering an agent run.
- `GET` endpoints are unguarded; they only read local report files.
- The Jira token lives in `.env` and never reaches the client: pulls run in the dev-server
  process and only the resulting report is served.

Report data stays out of git (see above), so the repository itself carries no personal
content — only code. The generated files on your disk are another matter: keep them
local.

## Why it stays local

Report generation runs as *me*, which is the whole reason it needs no integration
work — and exactly why it does not generalize to other users:

1. **Credentials are mine.** `/email` drives my logged-in Chrome; the pulls use my `gh`
   keyring auth and one Jira API token in `.env`. Serving other people means real per-user
   OAuth for Google, Microsoft, GitHub and Jira, with encrypted server-side tokens — and
   dropping the browser-automation path entirely.
2. **Storage is global.** Reports are static files any page load can fetch, and
   `db/<date>.json` has no notion of who is asking. Multi-user needs a datastore
   keyed by user and authorization on every read and write.
3. **There is no server or auth.** The API only exists in dev mode.
4. **Job execution is a single in-memory lock.** Fine for one person; N users need
   per-user queued jobs with status and concurrency limits.

If teammates should see these reports, publish read-only snapshots instead. If they
want their own dashboard, they clone the repo and run their own copy against their
own Chrome and `gh` — N private instances, no auth layer to build.

## Layout

```
config/             your settings (gitignored)
skills/             sanitized mail skill + report template, and the report contract
src/emailRows.ts    shared mail-row/todo-id derivation
src/prState.ts      PR review state + deploy-qc chip derivation
src/reportSchema.ts report shape guards
config.template/    committed template to copy
public/reports/     report JSON + index.json (gitignored)
db/                 per-day snapshots and todo state (gitignored)
src/pages/          Home, Email, Jira, Calendar routes
src/components/     cards, widgets, donut, accordion, refresh button
server/github.mjs   open-PR pull, deploy-qc comparison, ticket↔PR match, PR actions
server/jira.mjs     Jira REST pull (JQL → tickets, grouped by status)
.env.example        Jira credentials to copy to .env (gitignored)
src/types.ts        report schemas
src/db.ts           day-file client
src/refresh.tsx     refresh state + provider
vite.config.ts      db API, refresh API, cross-site guard
```

## Notes

- `@rolldown/binding-darwin-arm64` is pinned as a devDependency to work around npm
  skipping the optional native binding ([npm/cli#4828]). Remove it once a later npm
  installs it reliably.
- MUI supplies the accordions, checkboxes, and icon buttons; everything else is plain
  CSS with light/dark tokens in `src/index.css`.

[npm/cli#4828]: https://github.com/npm/cli/issues/4828
