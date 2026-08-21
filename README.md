# reporto

A personal dashboard for daily work triage: mail, calendar, Jira tickets, and my open
pull requests, each rendered from a JSON report on disk.

**This is a single-user, local-only app by design.** See
[Why it stays local](#why-it-stays-local) before considering deploying it anywhere.

![The dashboard: open PRs with review and deploy-qc state, Jira tickets, mail and calendar
widgets](docs/home.jpg)

Rendered from the synthetic fixtures in `src/stories/fixtures.ts` via the `Pages/Home`
story, not from real reports — those hold mail subjects and ticket detail and never leave
your disk. The same story in the Nord palette: [docs/home-nord.jpg](docs/home-nord.jpg).

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
| `calendar-<date>.json` | server, Google Calendar API; `/email` skill adds Outlook | today's events, upcoming watch-list |
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

### Google Calendar

Two ways in. A plain API key is not one of them: Google accepts keys only for public data.

**Service account (no browser, no expiry).** Cloud console → enable the Google Calendar API →
create a service account → download its JSON key. Keep the key outside this repo
(`~/.config/reporto/google-sa.json`, `chmod 600`) and point `GOOGLE_SERVICE_ACCOUNT_KEY` at
it. Then, for each calendar: Calendar settings → Share with specific people → add the
service account's `client_email` with "See all event details".

A service account **cannot enumerate calendars** — sharing grants access but does not add
the calendar to its `calendarList`, which stays empty. So `calendarIds` in
`config/reporto.json` must name each calendar address explicitly. An id it cannot read is
logged and skipped rather than failing the pull.

That limitation bites on calendars you do not control: a team calendar you were merely
invited to cannot be shared onward unless you have "make changes and manage sharing", so
its entries stay missing until the owner shares it with the service account.

**Installed-app OAuth (reads everything you can read).** Use it when the above is blocked:

```bash
npm run google-auth   # one-time browser consent; writes GOOGLE_REFRESH_TOKEN to .env
```

Needs a Desktop-app OAuth client with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`
first; scope `calendar.readonly`. This path uses your own `calendarList`, so subscribed
calendars come along without anyone sharing anything.

**Set that consent screen to Internal (Workspace) or In production.** Left in "Testing", Google
expires the refresh token after seven days and the pull starts failing with `invalid_grant` —
the error message says so, but it is worth avoiding.

Recurring events are expanded by Google (`singleEvents=true`), so the stand-up and kick-offs
arrive as concrete instances and no iCal parsing is needed. Declined invitations are dropped,
and conferencing links come through the API — the thing the browser path could never read.

### Jira

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

## Storybook

```bash
nvm use            # .nvmrc pins 20.19.5
npm run storybook  # http://localhost:6006
```

Every component has stories, driven by **synthetic** fixtures in
[`src/stories/fixtures.ts`](src/stories/fixtures.ts) — never the real reports, which are
gitignored precisely because they hold mail subjects and ticket detail. The fixtures are
built to cover the states that are otherwise hard to reach: each PR review state and its
deploy-qc pairing, a merged PR dropped from `deploy-qc`, an all-day-only calendar, a report
written before the puller carried QC data, and empty versions of every panel.

Storybook 10 and Vite 8 both need Node 20.19+, which is why `.nvmrc` exists; the repo
otherwise runs on whatever `node` you have.

## Update buttons

Jira and PRs can be refreshed from the dashboard. Mail and calendar cannot, and carry no
button at all — those cards only show how old their data is.

| Report | How it refreshes |
|---|---|
| `prs` | `POST /api/pull/prs` — one GitHub GraphQL call, about a second (bolt icon) |
| `jira` | `POST /api/pull/jira` — one Jira search plus one GitHub search (bolt icon) |
| `calendar` | `POST /api/pull/calendar` — Google Calendar API (bolt icon) |
| `email` | run `/email` in your own Claude Code session |

The calendar pull covers **Google only**. Outlook is readable only through the Chrome
extension, so the `/email` skill remains the only thing that can see it — and a pull would
otherwise drop the stand-up that lives there.

Both sides therefore merge instead of overwriting: the puller keeps every event whose
`source` is not `google`, and the skill keeps the Google ones and no longer reads Google
Calendar at all. Whichever runs last, neither half deletes the other.

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

Each row in "My open PRs" carries a **Ready for review** / **Convert to draft** button —
labelled with the outcome rather than the state, so it reads like GitHub's own button — and a
menu for what has no button of its own.
`POST /api/pr/<repo>/<num>/<action>` applies it with the same pinned GitHub token as the
puller, behind the same cross-site guard. The action must be one of four the server knows;
**merging is not one of them and never will be.** Closing asks for confirmation first,
naming the repo, number and title, since it is the only one that discards work.

## Changing a ticket's status

The status chip on a Jira card is also the control — it carries a caret to say so. Click it
and the menu lists the statuses `statusChoices` allows, fetched then rather than with the
report: options depend on the current status and differ per project, and asking for thirty
tickets up front would be thirty round trips for a menu that usually stays shut.

Jira offers the entire workflow, which here is twenty-odd statuses including several nobody
moves a ticket to by hand. `statusChoices` in `config/reporto.json` narrows that to the ones
in daily use, matched on a transition's **target status** rather than its name, since Jira
names transitions inconsistently. The filter is applied server-side and re-checked when a
transition is applied, so a stale page cannot reach an excluded status.

`GET /api/jira/<KEY>/transitions` lists them; `POST /api/jira/<KEY>/transition` applies one,
behind the same cross-site guard as the other writes. The key must match a ticket-key shape
and the id must be one Jira just returned, so the request never names a status string. After
it lands the report is refetched rather than patched locally, because a workflow can land
somewhere other than the transition's advertised target.

Jira answers 400 when a transition is no longer valid from the current status — which means
the board moved under you — and that surfaces as "refresh and try again" rather than a raw
error.

## Palettes

`/settings` (the ⚙ beside the title) switches the palette; the choice is saved per browser
in `localStorage` and applied in `main.tsx` before the first render, so it never flashes the
default first. Five ship: Default, Nord, Terracotta, Mono and High contrast.

Tokens are layered so a palette stays short:

1. neutrals — `--bg`, `--panel`, `--ink`, `--ink-2`, `--line`, `--accent`
2. status inks — `--ok-ink`, `--bad-ink`, `--open-ink`, `--na-ink`, `--warn-ink`, `--qc-ink`, `--qcout-ink`
3. chip surfaces — **derived**, `color-mix(in oklab, var(--ok-ink) var(--chip-fill), var(--panel))`

Layer 3 is declared once for every palette. Custom properties resolve lazily, so overriding
`--ok-ink` in a `[data-palette]` block gives you a matching background and border for free —
a new palette means eight hues per mode, not twenty-four. `--chip-fill` / `--chip-edge` let a
palette push its chips louder or quieter, which is what High contrast does.

Light and dark both come from the palette, selected by `prefers-color-scheme`; there is no
in-app light/dark switch.

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
src/stories/        Storybook stories + synthetic fixtures
.storybook/         Storybook config; preview stubs the router and refresh context
server/github.mjs   open-PR pull, deploy-qc comparison, ticket↔PR match, PR actions
server/jira.mjs     Jira REST pull (JQL → tickets, grouped by status)
server/googleCalendar.mjs  Google Calendar pull; carries over Outlook events
scripts/google-auth.mjs    one-time OAuth consent → refresh token in .env
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
